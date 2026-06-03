# Stage 7 — Advanced / Scale (Spec, prioritize by demand)

> Optional modules. Pick based on customer feedback; each needs its own deeper spec + acceptance criteria before building. All follow the same rules: tenant RLS, i18n, audit, integer-rupiah money, reproducible compliance.

## Candidate modules

**Performance & KPI** — goals, reviews, KPI tracking per employee/team (Talenta/GreatDay parity).

**Recruitment / ATS** — job postings, candidate pipeline, interview scheduling, offer → convert to employee.

**Loans & cash advances (kasbon)** — employee loan requests, approval, installment deductions wired into payroll.

**Public API & webhooks** — GreatDay-style Open API: API keys per company, scoped tokens, REST endpoints for employees/attendance/payroll, outbound webhooks. Strong rate limiting and per-company scoping.

**Enterprise auth** — SSO (SAML/OIDC), SCIM provisioning, enforced MFA, IP allowlists.

**Analytics dashboards** — headcount, payroll cost trends, attendance/turnover analytics. Could ship as a **live Cowork artifact** that reads connector data and refreshes on open.

**Multi-currency / expat** — foreign employees, currency handling, tax treaty considerations.

**Mobile offline mode** — queue attendance offline, sync on reconnect.

**WhatsApp notifications** — payslip ready, approvals, reminders via WhatsApp Business API (popular in Indonesia).

**Compliance center** — regulation change log, rate-update workflow for the reference tables, filing deadline reminders (Cloud Scheduler).

## Cross-cutting at scale

- Performance: indexes, pagination, read replicas if needed; cache reference data.
- Observability: Cloud Logging dashboards, error tracking (Sentry), uptime checks.
- Cost controls on Cloud Run/Tasks; autoscaling tuned.
- Data lifecycle: retention policies, archival, GDPR/UU-PDP erasure tooling.

Each module: define data model + RLS, UI, acceptance criteria, and tests before implementation.
