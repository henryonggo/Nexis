# Week 3 dry run — operator runbook

Companion to `dry-run-preflight-2026-07.md` (the read-only readiness check).
This is the **step-by-step** for executing Beras Wortel's July 2026 payroll
cycle via the agent on **staging**, with owner approval — workflow zero
(`PIVOT-PHASE-1.md`). Due **Jul 24**. Run it against staging, never
production; every draft it creates is reversible (cancel), and no money
moves — the cycle stops at a **draft** run for human review.

**Roles:** the Boss drives the browser (owner/admin session); the
orchestrator watches the failure log and the numbers.

## 0. Preconditions (confirm before you start)

- [ ] Pre-flight is green — see `dry-run-preflight-2026-07.md` (rates in
      force, 7 active employees, tax profiles present, audit INSERT policy
      live).
- [ ] Migration `20260720143000_agent_cycles_and_approval_expiry` is applied
      to staging — otherwise the cycle still runs but the **Riwayat agen**
      history and `agent_cycles` rows won't record (the cycle's `recorded`
      flag will be `false`; not fatal, but you lose the durable log).
- [ ] Model access: either `ANTHROPIC_API_KEY` is set in the Vercel env
      (Pro plan, 300s actions), **or** run `/approvals` from local dev
      pointed at staging (the dry run must not wait on the Vercel key —
      that key only blocks the Week 4 **live** run).
- [ ] You are signed in as an **owner/admin** of CV AGRI PANGAN GLOBAL
      (only owner/admin sees the agent panel and the approve/reject buttons).

## 1. Run the cycle

1. Open **`/approvals`**. The **Agen Payroll** panel is at the top.
2. Leave the default instruction (“Jalankan siklus payroll {bulan}: hitung
   seluruh karyawan, lalu usulkan pembuatan draf payroll.”) and click
   **Jalankan agen**. Give it up to ~300s.
3. Read the **Status siklus** block that appears:
   - **finalText** — the agent's own summary (id-ID).
   - **Perlu dilengkapi (halts)** — any employee the engine refused to
     compute. **Expected: exactly one** — the July-17 hire (E-7) with code
     `mid_period_compensation`. **This halt is the correct outcome, not a
     failure**: a full month for a mid-month hire would be an estimated
     number (non-negotiable #1). Log it in §4 as *designed behavior*.
   - **Usulan menunggu persetujuan** — the `create_draft_payroll_run`
     proposal for the other **6** employees.

> If the agent halts on ANYTHING other than E-7's
> `mid_period_compensation`, stop and log it — that is a real discrepancy,
> not expected.

## 2. Verify the numbers BEFORE approving

The proposal is the point of the gate: **approve numbers you have checked.**

- In the pending card, the readable line should say **“Buat draf payroll
  untuk Juli 2026”** (not raw JSON). Expand **Detail usulan** only if you
  want the raw payload.
- Compare the agent's computed totals against the manual/legacy calc, per
  employee, **integer rupiah, no rounding drift**:
  `gross`, `bpjs_employee`, `bpjs_employer`, `pph21` (TER), `net`.
  Every line must match to the rupiah. Any mismatch → §4.
- Confirm **6** employee lines are present (7 active − 1 halted E-7).

## 3. Approve → resume → draft

1. In the **pending** list, click **Setujui** on the `create_draft_payroll_run`
   request (or **Tolak** to abort — nothing is created).
2. The approved request now shows in the agent panel's green
   **resume** strip. Click **Lanjutkan siklus**.
3. The agent re-invokes `create_draft_payroll_run` with the approved request
   as a **single-use** token (`consume_approval` enforces this + the payload
   hash server-side). Expected status: **Selesai (completed)**, with a draft
   `payroll_runs` row created for 2026-07.
4. Re-approving or re-resuming the same request must fail (token already
   consumed) — a quick check that single-use holds.

## 4. What to log, and where

Everything observed goes in `failure-log.md` (newest first, the format at the
top of that file). Log an entry for **each** of:

- **The E-7 halt** — as designed behavior (workflow step: compute; cause:
  mid-period hire; fix: proration is NEXT-5, backdated comp row unblocks it).
- **Any numeric discrepancy** vs the manual calc (which employee, which
  field, agent value vs expected, integer rupiah).
- **Any unexpected halt, denied, or error** the agent surfaced.
- **`audit.recorded` gaps** — if any tool call came back with
  `audit.recorded: false`, note it (the audit INSERT policy shipped in
  `20260704020000`, so this should now be `true`).
- **`agent_cycles` gap** — confirm a row appears under **Riwayat agen** for
  this cycle; if the cycle's `recorded` was `false`, log why (usually the
  migration in §0 wasn't applied).

## 5. Expected end state

- 6 of 7 employees compute cleanly; **1 designed halt** (E-7,
  `mid_period_compensation`).
- One approved-then-consumed `create_draft_payroll_run`; one **draft**
  `payroll_runs` row for 2026-07 with a `config_snapshot`.
- One `agent_cycles` row (status `completed`) visible in **Riwayat agen**.
- The failure log has real entries — **that log is the Phase-2 input**
  (`ROADMAP.md` NEXT re-ranks from it, not from guesswork).

## 6. Safety / rollback

Staging only. The cycle stops at a **draft** — no payslips, no payments, no
statutory submission. To reset: cancel the draft run
(`cancel_payroll_run`, or the payroll UI) and re-run from §1. Rejecting the
approval at §3 leaves nothing behind.
