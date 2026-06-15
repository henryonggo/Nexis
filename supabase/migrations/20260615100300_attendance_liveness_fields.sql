-- Nexis — Add liveness verification fields to attendance_records
alter table public.attendance_records
  add column if not exists liveness_passed boolean,
  add column if not exists liveness_score numeric,
  add column if not exists liveness_method text;
