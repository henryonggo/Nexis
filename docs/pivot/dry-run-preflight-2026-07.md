# Dry-run pre-flight (2026-07-19)

Read-only re-run of the `week1-staging-readiness.md` checks against staging,
ahead of the Week 3 dry run (due Jul 24). Company: **CV AGRI PANGAN GLOBAL**
(Beras Wortel), id `93b4e957-339d-4665-9f05-221619d32c2d`. No writes, no
schema changes.

## Checks

| Check | Week 1 (Jul 3) | Now (Jul 19) |
|---|---|---|
| Active employees | 6 | **7** |
| Missing compensation rows | 0 | 0 |
| Missing tax profiles | 0 | 0 |
| Non-monthly pay frequencies (current comp) | 0 | 0 |
| `bpjs_config` rows in force on 2026-07-01 | 14 | 14 |
| `ter_rates` categories / bands | 3 / 129 | 3 / 129 |
| Company JKK risk class | `very_low` | `very_low` |
| Approved overtime in 2026-07 | 0 | 0 |
| Enabled configurable earnings | 2 (fixed, taxable) | 2 (fixed, taxable) |
| Earning-group assignments | 0 | 0 |
| `audit_logs` INSERT policy present | **no** | **yes** (1 policy) |
| `audit_logs` rows with `entity='agent_tools'` | 0 | 0 (no tool runs since policy) |

`audit.recorded === true` can only be confirmed by a live tool call — first
tool call of the dry run should be checked for it explicitly.

## Finding: mid-July hire (E-7)

The 7th active employee's only compensation row is effective **2026-07-17**
(monthly frequency). `computeEmployeeStatutory` selected the latest row
effective on/before period end and computed a **full month** — no proration,
no halt — so the July run would have proposed a full month's salary for
roughly half a month worked: a silently wrong number, violating
non-negotiable #1.

**Action taken (same day):** new structured halt `mid_period_compensation`
in `@nexis/agent-tools` statutory resolution — any selected comp row with
`effective_from > period start` halts instead of computing. Proration stays
unbuilt until a roadmap item ships it; the halt names the employee and the
effective date so the owner can decide.

**Dry-run expectation:** 6 of 7 employees compute cleanly; E-7 halts with
`mid_period_compensation`. The halt IS the correct output — log it in the
failure log as designed behavior, and let it drive the proration item's
ranking in NEXT.
