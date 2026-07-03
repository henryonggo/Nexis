# Week 1 — Staging readiness check (2026-07-03)

Read-only verification of the staging Supabase project against the inputs
`packages/agent-tools` needs for the July 2026 period. No writes, no schema
changes. Company: **CV AGRI PANGAN GLOBAL** (Beras Wortel), id
`93b4e957-339d-4665-9f05-221619d32c2d`.

## What the two tools would see today

| Check | Result |
|---|---|
| `bpjs_config` rows in force on 2026-07-01 | 14 (full seed set) |
| `ter_rates` categories in force (A/B/C) | 3, 129 bands total |
| Active employees | 6 |
| Missing compensation rows | 0 |
| Missing tax profiles | 0 |
| Non-monthly pay frequencies | 0 |
| Company JKK risk class | `very_low` (set) |
| Approved overtime in 2026-07 | 0 |
| Configurable earnings enabled | 2 rows, both on **one** employee (Puput) |

**Conclusion:** `fetch_employee_roster` returns 6 complete lines.
`compute_pph21_for_employee` computes cleanly for **5 of 6** employees and
halts with `configurable_earnings_not_supported` for Puput (Lunch
Accommodation Rp 500.000 + Transport Allowance Rp 100.000, both taxable) —
the correct behaviour: including her would require folding configurable
earnings into gross, which is Week 2 scope. That halt is the first concrete
Week 2 requirement: **the full-cycle tool set must resolve configurable
earnings into taxable gross** (reuse `apps/web/lib/earnings.ts` logic).

## Gaps found (for db-engineer / Week 2)

1. **`audit_logs` has zero INSERT policies.** Agent tool executions currently
   get `audit.recorded: false` on every call — the audit trail the pivot
   requires cannot be written under RLS. Matches the `TODO(db)` in
   `packages/agent-tools/src/tool.ts`: need an INSERT policy allowing company
   members to write rows with `entity = 'agent_tools'`.

2. No others. Rate references, compensation effectivity, tax profiles, and
   company settings are all complete for workflow zero.
