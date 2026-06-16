-- Primecom OCPP Platform - Schedules & Employees Migration
-- Paste this into the Supabase SQL Editor to create required tables.
-- Run once per environment (dev, production).

-- Employees table
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  address text,
  role text default 'driver',
  user_id uuid,
  cdl_url text,
  notes text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Shifts table
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time text not null,
  end_time text not null,
  color text default '#3b82f6'
);

-- Seed default shifts if table is empty
insert into shifts (name, start_time, end_time, color)
select 'Day Shift', '06:00', '18:00', '#3b82f6'
where not exists (select 1 from shifts where name = 'Day Shift');

insert into shifts (name, start_time, end_time, color)
select 'Night Shift', '18:00', '06:00', '#6366f1'
where not exists (select 1 from shifts where name = 'Night Shift');

-- Schedule assignments
create table if not exists schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  shift_id uuid references shifts(id) on delete cascade,
  work_date date not null,
  is_supervisor boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- Time off requests
create table if not exists time_off_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status text default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- Schedule settings (singleton row)
create table if not exists schedule_settings (
  id int primary key default 1,
  time_off_min_notice_days int default 14,
  auto_notify_enabled boolean default false,
  auto_notify_day text default 'sunday',
  notify_via_sms boolean default true,
  notify_via_email boolean default true
);

-- Insert default settings if not present
insert into schedule_settings (id) values (1) on conflict (id) do nothing;
