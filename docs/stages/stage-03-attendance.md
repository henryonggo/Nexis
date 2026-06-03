# Stage 3 — Attendance & Scheduling (Spec)

> Expand with deeper research (geofencing accuracy, liveness/anti-spoof approaches, Indonesian public-holiday source) before building.

## Objective

GreatDay-style attendance: employees clock in/out from mobile with GPS + selfie; admins see live status and correct records; overtime hours feed payroll.

## Scope

**Mobile (employee)**
- Clock in / out / break start / end (`attendance_records.kind`).
- Capture GPS (`expo-location`) and validate against company/site **geofence** (radius around allowed coordinates). Flag out-of-area as `is_valid=false` with reason.
- Capture **selfie** (`expo-camera`) for liveness; upload to private Storage; store path.
- Today view: status, hours worked, schedule.

**Web (admin/manager)**
- Live attendance dashboard using **Supabase Realtime** (who's in/out now).
- Attendance list per employee/date; filters; export.
- Correction/approval flow (admin/manager edits an event → audited).
- Work schedules & shifts; assign to employees/teams.
- Indonesian **public holiday calendar** (seedable, per year); mark weekends per `workweek_days`.
- Tardiness rules; **overtime detection** (hours beyond schedule) producing structured overtime data consumed by Stage 4 payroll (weekday vs rest-day/holiday multipliers per `05-...`).

## Data touched

New: `attendance_records`, `work_schedules`, `shifts`, `holidays`, `overtime_entries` (derive or store). All tenant-scoped with standard RLS + employee self-insert/self-read for own attendance.

## Acceptance criteria

1. Employee clocks in within geofence on mobile; selfie + GPS stored; record valid.
2. Out-of-geofence clock-in is flagged and requires admin approval.
3. Record appears on the web dashboard in real time.
4. Overtime hours are computed per Indonesian rules and exposed to the payroll engine.
5. Admin correction is applied and written to `audit_logs`.
6. Holidays seeded for the current year affect schedule/overtime classification.
7. RLS: employees see only their own attendance; managers see their team; admins see all in the company.
