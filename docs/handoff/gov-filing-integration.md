# Handoff — Government filing integration (DJP Online / SIPP) — 🟡 OPEN (Antigravity)

> **Owner:** Antigravity (Edge fn + secrets + external API) / human (DJP & BPJS credentials).
> Post-beta, **depends on** `docs/handoff/compliance-exports.md` (file generation first).
> Source: `docs/10-beta-workflow-painpoints.md` ("requires company NPWP + paid plan gating").

## Problem

`compliance-exports` produces the e-Bupot + SIPP files HR uploads by hand. The next step is
**direct submission** to DJP Online (PPh 21) and BPJS SIPP — no manual portal upload. This is
infra + external-API + secrets work, gated to paid plans with a valid company NPWP.

## TODO(infra) — Antigravity

1. **Edge functions** `submit-djp(run_id)` and `submit-sipp(run_id)` that take the generated
   artefact and POST to the respective government API. Mirror the Edge-fn + service-role
   pattern already used (`billing-webhook`, `dispatch-webhook`).
2. **Secrets** via the function env / Secret Manager — DJP & BPJS API credentials/certs;
   never in the repo.
3. **Submission ledger** — a `filing_submissions` table (run_id, kind djp|sipp, status
   queued/submitted/accepted/rejected, external_ref, response payload, submitted_at) so the
   app can show filing status and retries are idempotent. `TODO(db)` + regenerate types.
4. **Gating** — reuse the `plan`/`npwp` checks from `enforce_payroll_run_gating`
   (`20260613111500_handoff_updates.sql`): only paid plan + company NPWP may submit.
   Typed errors (`PLAN_GATE_FREE`, `NPWP_REQUIRED`) the app already maps.

## App follow-up — Claude

- "Lapor ke DJP" / "Kirim ke SIPP" buttons on `/payroll/[runId]` (completed/paid, owner/admin),
  showing `filing_submissions` status (queued → submitted → accepted/rejected) via a small
  read. Reuse the run `status-stream` pattern for live status. i18n.

## Acceptance

- Owner/admin on a paid plan submits a completed run to DJP and to SIPP; the ledger records
  the external reference and final status; rejection surfaces the government error message.
- Free-plan / missing-NPWP companies are blocked with the existing typed messages.

## Risk / sequencing

External-API contracts + credentials are the long pole (human + DJP/BPJS onboarding). Build
`compliance-exports` first; this integration is a fast-follow once credentials exist.
