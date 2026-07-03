/**
 * Approval payload hashing (ADR 0002). The hash binds an approval to the
 * exact tool call it authorizes: `approval_requests.payload_hash` is computed
 * here at request creation, and `executeTool` recomputes it at execution —
 * the DB-side `consume_approval` RPC only consumes the token if they match.
 *
 * This is the single hashing implementation on the app side; the DB never
 * hashes, it only compares, so determinism here is the whole contract.
 */

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortValue(v)]),
    );
  }
  return value;
}

/** Deterministic JSON: object keys sorted recursively, undefined dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value)) ?? "null";
}

/**
 * sha-256 hex over `<toolName>\n<canonicalJson(input)>`. Web Crypto, so it
 * runs identically in Node ≥18, edge runtimes, and workers.
 */
export async function approvalPayloadHash(toolName: string, input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(`${toolName}\n${canonicalJson(input)}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
