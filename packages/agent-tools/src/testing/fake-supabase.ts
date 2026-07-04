/**
 * Minimal in-memory stand-in for the RLS-scoped Supabase client, implementing
 * only the query-builder surface the agent tools use: select with eq/gte/lte
 * filters, order, limit, maybeSingle, and insert. Tests cast it to
 * SupabaseClient<Database>; RLS itself is exercised by pgTAP on the DB side,
 * not here.
 */

type Row = Record<string, unknown>;

interface FakeResult {
  data: Row[] | Row | null;
  error: { message: string } | null;
  count: number | null;
}

class FakeQuery implements PromiseLike<FakeResult> {
  private filters: ((row: Row) => boolean)[] = [];
  private orderKey: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private single = false;
  private headCount = false;

  constructor(
    private rows: Row[],
    private failWith: string | null,
  ) {}

  select(_columns: string, opts?: { count?: string; head?: boolean }): this {
    if (opts?.head && opts.count) this.headCount = true;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: readonly unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push((row) => (value === null ? row[column] == null : row[column] === value));
    return this;
  }

  gte(column: string, value: string): this {
    this.filters.push((row) => String(row[column]) >= value);
    return this;
  }

  lte(column: string, value: string): this {
    this.filters.push((row) => String(row[column]) <= value);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderKey = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  maybeSingle(): this {
    this.single = true;
    return this;
  }

  private resolve(): FakeResult {
    if (this.failWith) return { data: null, error: { message: this.failWith }, count: null };
    let out = this.rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.orderKey) {
      const { column, ascending } = this.orderKey;
      out = [...out].sort((a, b) => {
        const cmp = String(a[column]).localeCompare(String(b[column]));
        return ascending ? cmp : -cmp;
      });
    }
    if (this.limitCount != null) out = out.slice(0, this.limitCount);
    if (this.headCount) return { data: null, error: null, count: out.length };
    if (this.single) return { data: out[0] ?? null, error: null, count: null };
    return { data: out, error: null, count: null };
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }
}

type RpcHandler = (args: Record<string, unknown>) => {
  data: unknown;
  error: { message: string } | null;
};

interface FakeInsert extends PromiseLike<{ error: { message: string } | null }> {
  /** Supports the `.insert(row).select("id").single()` chain. */
  select(columns: string): {
    single(): Promise<{ data: Row | null; error: { message: string } | null }>;
  };
}

interface FakeUpdate extends PromiseLike<{ error: { message: string } | null }> {
  eq(column: string, value: unknown): FakeUpdate;
  in(column: string, values: readonly unknown[]): FakeUpdate;
  /** Supports `.update(patch).eq(...).select("id").maybeSingle()`. */
  select(columns: string): {
    maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }>;
  };
}

export interface FakeSupabase {
  from(table: string): {
    select(columns: string): FakeQuery;
    insert(row: Row): FakeInsert;
    update(patch: Row): FakeUpdate;
  };
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  /** Rows inserted per table, for assertions (e.g. audit_logs). */
  inserts: Record<string, Row[]>;
  /** Patches applied per table via update(), for assertions. */
  updates: Record<string, Row[]>;
  /** RPC invocations, for assertions (e.g. consume_approval args). */
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
}

export function fakeSupabase(
  tables: Record<string, Row[]>,
  opts: {
    failTables?: Record<string, string>;
    failInserts?: Record<string, string>;
    failUpdates?: Record<string, string>;
    rpcHandlers?: Record<string, RpcHandler>;
  } = {},
): FakeSupabase {
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  let insertSeq = 0;
  return {
    inserts,
    updates,
    rpcCalls,
    from(table: string) {
      return {
        select: (columns: string, selectOpts?: { count?: string; head?: boolean }) =>
          new FakeQuery(tables[table] ?? [], opts.failTables?.[table] ?? null).select(
            columns,
            selectOpts,
          ),
        insert: (row: Row): FakeInsert => {
          const failure = opts.failInserts?.[table];
          let stored: Row | null = null;
          if (!failure) {
            stored = { id: `fake-${table}-${++insertSeq}`, ...row };
            (inserts[table] ??= []).push(stored);
            (tables[table] ??= []).push(stored);
          }
          const error = failure ? { message: failure } : null;
          return {
            then: (onfulfilled, onrejected) =>
              Promise.resolve({ error }).then(onfulfilled, onrejected),
            select: () => ({
              single: () => Promise.resolve({ data: stored, error }),
            }),
          };
        },
        update: (patch: Row): FakeUpdate => {
          // failUpdates falls back to failInserts for backwards compatibility.
          const failure = opts.failUpdates?.[table] ?? opts.failInserts?.[table] ?? null;
          const filters: ((row: Row) => boolean)[] = [];
          const apply = (): Row[] => {
            const matched: Row[] = [];
            for (const row of tables[table] ?? []) {
              if (filters.every((f) => f(row))) {
                Object.assign(row, patch);
                matched.push(row);
              }
            }
            (updates[table] ??= []).push(patch);
            return matched;
          };
          const self: FakeUpdate = {
            eq(column: string, value: unknown) {
              filters.push((row) => row[column] === value);
              return self;
            },
            in(column: string, values: readonly unknown[]) {
              filters.push((row) => values.includes(row[column]));
              return self;
            },
            select: () => ({
              maybeSingle: () => {
                if (failure) return Promise.resolve({ data: null, error: { message: failure } });
                const matched = apply();
                return Promise.resolve({ data: matched[0] ?? null, error: null });
              },
            }),
            then: (onfulfilled, onrejected) => {
              if (!failure) apply();
              return Promise.resolve({ error: failure ? { message: failure } : null }).then(
                onfulfilled,
                onrejected,
              );
            },
          };
          return self;
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      const handler = opts.rpcHandlers?.[fn];
      if (!handler) {
        return Promise.resolve({ data: null, error: { message: `rpc ${fn} not stubbed` } });
      }
      return Promise.resolve(handler(args));
    },
  };
}
