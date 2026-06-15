-- Nexis — Add termination_date to employees table to support turnover analytics
alter table public.employees add column if not exists termination_date date;
