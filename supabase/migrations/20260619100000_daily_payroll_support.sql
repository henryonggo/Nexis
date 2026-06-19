-- Nexis — Daily Payroll Support database schema changes (H-4)
-- Date: 2026-06-19

-- ── 1. Add pay_frequency check constraint to compensation ───────────────────
alter table public.compensation
  add constraint compensation_pay_frequency_check
  check (pay_frequency in ('monthly', 'daily'));

-- ── 2. Add days_worked column to payroll_items ──────────────────────────────
alter table public.payroll_items
  add column if not exists days_worked numeric(4,1) null;
