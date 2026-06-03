# 00 — Product Vision

## One-line

Nexis is an Indonesian HR & Payroll SaaS where one account can run multiple companies, each fully compliant with Indonesian payroll law, starting free for the first 5 employees.

## Problem

Indonesian SMEs and accounting/HR-outsourcing firms juggle payroll across BPJS Kesehatan, BPJS Ketenagakerjaan, PPh 21 (now the TER method), THR, and overtime rules that change yearly. Existing tools (GreatDay HR, Gadjian, Talenta, Dayforce) are powerful but heavy to onboard and priced past very small businesses. Accountants and HR consultants who manage *several* client companies are poorly served by single-tenant tools.

## Who it's for (personas)

1. **Owner / Founder (small business, 1–20 staff).** Wants to run payroll correctly without hiring a payroll specialist. Enters via the free 5-employee tier.
2. **HR / Finance Admin.** Day-to-day operator: manages employees, attendance, payroll runs, payslips, BPJS/PPh reports.
3. **Accountant / Payroll consultant (multi-company).** The power user behind the "one user, many companies" requirement. Switches between client companies, each with its own data and their own staff who may have limited roles.
4. **Employee (mobile).** Self-service: clock in/out (GPS + selfie/liveness like GreatDay), view payslips, request leave, submit reimbursement claims, update personal data.

## Differentiators

- **True multi-tenancy per user.** Company switcher, per-company roles, complete data isolation enforced by Postgres RLS.
- **Frictionless free start.** First 5 employees free per company. No company NPWP or tax IDs required while free — collect them only when needed (upgrade or tax-affecting payroll).
- **Compliance as data.** Tax brackets, PTKP, BPJS caps and rates are versioned reference tables, so 2026/2027 regulation changes are a data update, not a code release.
- **Mobile-first employee experience, web-first admin experience.**

## Pricing model (drives feature gating)

- **Free:** up to 5 active employees per company. Core HR + attendance + basic payroll. Minimal onboarding fields.
- **Paid (per active employee / month), tiers TBD:** unlocks >5 employees, full payroll automation, BPJS/PPh 21 e-reporting exports, advanced approvals, API access, multi-admin. Requires company legal/tax details (NPWP, BPJS account numbers).

Billing is implemented in Stage 6. Until then the free limit is enforced by a DB rule but no payment is collected.

## Success criteria for v1 (Stages 1–4)

A new user can sign up, create a company, add up to 5 employees free, record attendance, and run a compliant monthly payroll producing correct PPh 21 (TER), BPJS, and net pay with downloadable payslips — all within Indonesian regulation and with strict per-company data isolation.

## Explicit non-goals (for now)

- Recruitment/ATS, performance reviews, learning management (later/optional).
- Non-Indonesian payroll jurisdictions.
- Desktop-native apps.
