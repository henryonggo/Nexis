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
`compute_pph21_for_employee` initially halted for Puput (Lunch Accommodation
Rp 500.000 + Transport Allowance Rp 100.000 override, both taxable, both
fixed-amount) — so the tool was extended the same day to resolve manual,
enabled, active, **fixed-amount** configurable earnings into taxable gross,
mirroring `apps/web/lib/earnings.ts` resolution (group wins → halt in v0;
percentage earnings → halt in v0). With that, **all 6 of 6** employees
compute cleanly. Percentage earnings and earning groups remain Week 2 scope
(their bases follow earned-base logic landing with the full-cycle tool set).

## Gaps found (for db-engineer / Week 2)

1. **`audit_logs` has zero INSERT policies.** Agent tool executions currently
   get `audit.recorded: false` on every call — the audit trail the pivot
   requires cannot be written under RLS. Matches the `TODO(db)` in
   `packages/agent-tools/src/tool.ts`: need an INSERT policy allowing company
   members to write rows with `entity = 'agent_tools'`.

2. No others. Rate references, compensation effectivity, tax profiles, and
   company settings are all complete for workflow zero.
