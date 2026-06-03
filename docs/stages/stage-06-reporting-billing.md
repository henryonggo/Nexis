# Stage 6 — Reporting, Exports & Billing (Spec)

> This stage makes Nexis filable and monetizable. Research current DJP e-Bupot 21 and BPJS SIPP file formats, and the chosen payment gateway's API, before building.

## Objective

Produce official tax/BPJS reports and exports, and turn on subscription billing that unlocks >5 employees and collects company legal/tax details on upgrade.

## Scope

**Reporting & exports**
- Payroll summary report (per run, per period, per department).
- BPJS contribution report (Kes + Ketenagakerjaan, employee/employer breakdown).
- **PPh 21 / e-Bupot** export in DJP-accepted format; annual reconciliation summary.
- **BPJS SIPP** export format.
- Generic CSV/XLSX/PDF exports; heavy exports run on Cloud Run and deliver via signed URL.
- Use the **`xlsx` Cowork skill** to design the report workbooks/templates.

**Billing & subscriptions**
- Gateway: Stripe (international) and/or **Midtrans/Xendit** (Indonesian cards, VA, e-wallet, QRIS).
- Plans: free (≤5 seats) → paid tiers (seat-based). Active-seat metering from `company_billing.active_seats`.
- **Upgrade flow collects company NPWP + BPJS account numbers** (now required) and stores in `company_billing`.
- Subscription lifecycle: checkout, webhooks (payment success/failure), plan change, cancellation, invoices.
- Lift the free-seat trigger limit when on a paid plan (trigger already checks `plan`).

## Data touched

`company_billing` (npwp, bpjs numbers, plan, seats, subscription id), new `invoices`, `subscriptions`, `report_jobs`. RLS: billing/exports restricted to owner/admin.

## Acceptance criteria

1. Admin upgrades past 5 seats via sandbox payment; webhook flips `plan`; >5 employees now allowed.
2. NPWP + BPJS numbers captured and validated on upgrade.
3. PPh 21 and BPJS exports generate in the expected formats and reconcile with payroll totals.
4. Seat metering matches active employees; invoices generated.
5. RLS: only owner/admin access billing and exports; audit log records billing changes and exports.
