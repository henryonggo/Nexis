# 07 — Security, Privacy & Data Protection

## Threat model in one line

A multi-tenant payroll app holds salaries, bank accounts, and national IDs for many companies. The two worst outcomes are **cross-tenant data leakage** and **leaked secrets**. Everything below defends those.

## 1. Tenant isolation (defense in depth)

1. **RLS is mandatory** on every tenant-scoped table (see `03-database-schema.md`). Authorization decisions are made in Postgres via `auth.user_has_company_access` / `auth.user_role_in_company`, keyed on `auth.uid()` from the verified JWT.
2. **App layer never authorizes alone** and never trusts a client-supplied `company_id` for access decisions.
3. **Service-role key** (which bypasses RLS) is used *only* server-side (Next.js server actions, Cloud Run worker, Edge Functions) — never bundled to web/mobile.
4. **Privileged operations** use `SECURITY DEFINER` functions with `set search_path = public` and explicit `auth.uid()` checks (e.g. `create_company_with_owner`).
5. **pgTAP tests** prove isolation as part of CI (Stage 1+).

## 2. Authentication

- Supabase Auth (GoTrue): email/password + email verification, password reset, optional Google OAuth.
- Password policy: min length, breached-password check if available; rate-limit auth endpoints.
- JWT short-lived + refresh; secure storage (httpOnly cookies on web, `expo-secure-store` on mobile).
- Optional MFA (TOTP) for `owner`/`admin` roles in a later stage.

## 3. Secrets management

- All secrets in **GCP Secret Manager** (and Vercel encrypted env for web). Nothing sensitive in the repo or client bundles.
- Separate keys per environment (local/staging/prod). Rotate on schedule.
- Cloud Run services use dedicated service accounts with **least privilege** (only the buckets/queues they need).
- Cloud Run payroll endpoint is **not publicly invocable** — Cloud Tasks/Scheduler call it with OIDC auth.

## 4. Data protection — UU PDP (Law No. 27/2022) & general privacy

- **Data minimization:** this is *why* the free tier collects no company NPWP and minimal personal data. Collect tax IDs and bank details only when a feature genuinely needs them (payroll/upgrade).
- **Consent & purpose limitation:** record consent for processing personal data; use only for stated HR/payroll purposes.
- **Sensitive fields** (NPWP, NIK, bank account, salary) — restrict read access by role via RLS; consider column-level encryption / pgsodium for the most sensitive at-rest values.
- **Right to access/erase:** provide export and deletion paths for personal data (employee offboarding; account closure cascades).
- **Breach handling:** logging + alerting; documented incident process.
- **Data residency:** prefer Supabase/GCP regions close to Indonesia (e.g. Singapore `asia-southeast1`) for latency and any residency expectations.

## 5. Storage & files

- Payslip PDFs, selfies, receipts in private buckets (Supabase Storage with RLS-backed access, or GCS with signed URLs).
- Never public-read. Access via short-lived signed URLs issued server-side after an authorization check.

## 6. Auditing

- `audit_logs` table records sensitive actions (role changes, payroll approval, member removal, billing changes, data exports). Written by `SECURITY DEFINER` triggers/functions, readable by company admins only.
- Cloud Logging as a secondary structured-log sink for the worker and edge functions.

## 7. Input validation & money safety

- Zod validation at every boundary (client + server). Reject, don't coerce.
- Money is integer rupiah end to end; payroll math is pure & unit-tested; runs snapshot their config for reproducibility (see `05-...`).
- Idempotency keys on payroll run enqueue to prevent double runs/double pay.

## 8. CI security gates

- Dependency audit; secret scanning (no committed keys); `supabase db lint`; a check that any new table in a migration has RLS enabled (fail otherwise).
- Static analysis / typecheck strict.

## Checklist for the agent before marking any stage done

- [ ] New tenant tables have RLS + policies in the same migration.
- [ ] No service-role key reachable from client code.
- [ ] pgTAP isolation tests pass.
- [ ] Sensitive new fields are role-gated.
- [ ] Audit-log entries added for sensitive actions.
- [ ] Secrets only via Secret Manager / encrypted env.
