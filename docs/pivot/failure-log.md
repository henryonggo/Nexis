# Nexis Pivot — Agent Failure Log

Every agent error, hallucinated value, wrong tool call, or halt gets logged
here. **This log is the product roadmap** (see `PIVOT-PHASE-1.md`).

Format — one entry per incident, newest first:

```
## YYYY-MM-DD — <workflow step>
- **What happened:**
- **Cause:**
- **Fix:**
```

---

## 2026-07-31 — approve → process (worker handoff)

- **What happened:** During the Week 3 dry run, the `/approvals` preview
  computed cleanly (Gross Rp 127.600.000, BPJS employee Rp 3.607.370, PPh 21
  Rp 13.440.000, Net Rp 110.551.630), but **Approve & process** failed with
  `Worker payroll belum dapat dihubungi (Worker responded 500: <html>… 500
  Server Error … Please try again in 30 seconds …)`. The app rolled the run
  back to `draft` (`approveRun` soft-fail path), so nothing was half-written.
- **Cause:** Infrastructure-level failure of the Cloud Run payroll worker
  (`services/payroll-worker`) — **not** the payroll engine or the worker's
  request handler. Two tells: (1) the 500 body is Cloud Run's own HTML error
  page, whereas the worker's handler returns JSON (`index.ts:916`), so the
  request never reached the handler; (2) the run rolled back to `draft`,
  meaning the worker never transitioned it to `processing`/`failed`. A real
  500 (not 403/timeout) plus a boot guard that `process.exit(1)`s on a missing
  `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:39-42`) points to the container
  crash-looping at startup — most likely that secret unset/misbound on the
  deployed service. Cold-start / OOM are secondary candidates.
- **Fix:** Not yet applied — needs the Cloud Run logs to confirm. Check
  Cloud Run → `payroll-worker` → Logs; the boot case shows
  `CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing in env.` right before exit.
  If so: set the secret and redeploy (`services/payroll-worker/deploy.sh`
  wires `--set-secrets`). If instead a stack trace appears *inside*
  `/process`, it's a handler bug → code fix. **Blocks the dry run's
  approve→process→resume step until resolved.**
