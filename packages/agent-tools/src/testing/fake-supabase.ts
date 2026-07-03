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
}

class FakeQuery implements PromiseLike<FakeResult> {
  private filters: ((row: Row) => boolean)[] = [];
  private orderKey: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private single = false;

  constructor(
    private rows: Row[],
    private failWith: string | null,
  ) {}

  select(_columns: string): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
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
    if (this.failWith) return { data: null, error: { message: this.failWith } };
    let out = this.rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.orderKey) {
      const { column, ascending } = this.orderKey;
      out = [...out].sort((a, b) => {
        const cmp = String(a[column]).localeCompare(String(b[column]));
        return ascending ? cmp : -cmp;
      });
    }
    if (this.limitCount != null) out = out.slice(0, this.limitCount);
    if (this.single) return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }
}

export interface FakeSupabase {
  from(table: string): {
    select(columns: string): FakeQuery;
    insert(row: Row): PromiseLike<{ error: { message: string } | null }>;
  };
  /** Rows inserted per table, for assertions (e.g. audit_logs). */
  inserts: Record<string, Row[]>;
}

export function fakeSupabase(
  tables: Record<string, Row[]>,
  opts: { failTables?: Record<string, string>; failInserts?: Record<string, string> } = {},
): FakeSupabase {
  const inserts: Record<string, Row[]> = {};
  return {
    inserts,
    from(table: string) {
      return {
        select: () =>
          new FakeQuery(tables[table] ?? [], opts.failTables?.[table] ?? null),
        insert: (row: Row) => {
          const failure = opts.failInserts?.[table];
          if (!failure) (inserts[table] ??= []).push(row);
          return Promise.resolve({ error: failure ? { message: failure } : null });
        },
      };
    },
  };
}
