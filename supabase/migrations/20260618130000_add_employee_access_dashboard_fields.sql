-- Nexis — Add employee dashboard settings and navigation style to employee access configuration

alter table public.company_employee_access
  add column dash_pay boolean not null default true,
  add column dash_leave boolean not null default true,
  add column dash_attendance boolean not null default true,
  add column nav_style text not null default 'flat'
    constraint company_employee_access_nav_style_check
    check (nav_style in ('flat', 'pillars'));
