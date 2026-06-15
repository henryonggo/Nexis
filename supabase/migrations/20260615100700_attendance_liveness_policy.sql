-- Nexis — Attendance liveness validation policy

create or replace function public.validate_attendance_liveness()
returns trigger
language plpgsql as $$
begin
  if new.liveness_passed = false then
    new.is_valid := false;
    if new.note is null or position('[Failed liveness check]' in new.note) = 0 then
      new.note := trim(coalesce(new.note, '') || ' [Failed liveness check]');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_validate_attendance_liveness on public.attendance_records;

create trigger trg_validate_attendance_liveness
  before insert or update of liveness_passed on public.attendance_records
  for each row execute function public.validate_attendance_liveness();
