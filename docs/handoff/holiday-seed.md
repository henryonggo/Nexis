# Handoff — Holiday Calendar Seeding RPC (Case-02 G6)

> **Status:** ✅ **RESOLVED.** RPC `seed_indonesian_holidays(p_year)` landed
> (`supabase/migrations/20260612170500_holiday_seeding_rpc.sql`, Antigravity); the
> web Seed button is wired (`seedHolidays` action in `attendance/config/actions.ts`, Claude).
> This doc is the `TODO(db)` tracking item per `docs/08-agent-boundaries.md`.
> Full audit trail: `docs/cases/case-02-attendance-to-first-payroll.md` (step 21, Gap G6).

## Problem (one paragraph)

Indonesian payroll compliance requires a holiday calendar to calculate overtime correctly (distinguishing weekday overtime from rest-day/holiday overtime which yields higher statutory multipliers). While the `holidays` table and `calculate_overtime_hours` helper exist, the database has no holiday seed data, and there is no way for a tenant admin to populate it. Seeding needs a secure, server-side RPC since the `holidays` table is a global, shared table without a `company_id` (so direct tenant-layer inserts are forbidden by RLS).

## What's already built (Claude, app layer)

- A settings tab **Holidays** on `/attendance/config` has been built in [config-tabs.tsx](file:///c:/GIT/nexis/apps/web/app/(app)/attendance/config/config-tabs.tsx#L333-L377).
- It displays seeded holidays for the current year.
- It renders a **Seed Holidays {year}** button which is currently disabled and has a `TODO(db)` pointer.

## TODO(db) — required for Antigravity

### 1. Create RPC: `public.seed_indonesian_holidays(p_year integer)`

Create a `security definer` function that populates the `public.holidays` table for a given year:

- **Supported years:** Hardcode lists of official holidays for **2024**, **2025**, and **2026**.
- **Fallback:** For years other than 2024–2026, seed a set of default fixed-date national holidays (New Year on Jan 1st, Labor Day on May 1st, Pancasila Day on June 1st, Independence Day on Aug 17th, and Christmas on Dec 25th).
- **Upsert behavior:** Insert rows with `is_national = true`. Use `on conflict (date) do update set name = excluded.name` to be idempotent and allow correcting names or re-running without throwing unique constraint errors.
- **Security:** Define as `security definer` and set `search_path = public`. Restrict `EXECUTE` privilege to `authenticated` users.

### 2. pgTAP tests (`supabase/tests/holiday_seed.test.sql`)

Create a test file verifying:
- Seeding for a supported year (e.g. 2026) inserts the expected national holidays.
- Idempotency: running the RPC twice for the same year does not fail or duplicate rows.
- Fallback: seeding an unsupported year (e.g. 2028) inserts the 5 fixed-date default national holidays.
- RLS / privileges: anonymous users cannot execute the RPC, while `authenticated` users can.

### 3. Types Regeneration
- Run `pnpm db:types` after adding the migration so the RPC is fully typed for the web app.

## Acceptance (definition of done for this handoff)

1. Admin clicks **Seed Holidays 2026** on `/attendance/config` → 16 national holidays are populated instantly.
2. Subsequent clicks succeed silently (idempotent).
3. All pgTAP tests in `holiday_seed.test.sql` pass successfully.
4. `packages/types` regenerated and committed.

## Follow-ups that return to Claude after the migration

- Add server action `seedHolidays(year)` in `apps/web/app/(app)/attendance/config/actions.ts` calling the new RPC.
- Enable the button in `config-tabs.tsx` and wire it to call `seedHolidays`.
