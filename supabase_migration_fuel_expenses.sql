-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Fuel & Mileage Log + Expenses
-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Fleet vehicles ────────────────────────────────────────────────────────────
create table if not exists fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null unique,       -- e.g. "EMV-001"
  type text default 'emv',            -- emv | diesel
  capacity_kwh numeric(10,2),         -- battery capacity
  make text,
  model text,
  year int,
  plate text,
  vin text,
  notes text,
  active boolean default true,
  created_at timestamptz default now()
);

-- ── Trip logs ─────────────────────────────────────────────────────────────────
create table if not exists trip_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references fleet_vehicles(id),
  driver_name text,
  trip_date date not null,
  direction text not null,            -- 'outbound' | 'return'
  origin text,
  destination text,
  distance_miles numeric(10,2) default 12.4,
  start_soc_pct numeric(5,2),         -- state of charge %
  end_soc_pct numeric(5,2),
  energy_used_kwh numeric(10,2),      -- computed or entered
  efficiency_kwh_per_mile numeric(8,4),
  notes text,
  created_at timestamptz default now()
);

-- ── Fuel log settings (singleton row id=1) ────────────────────────────────────
create table if not exists fuel_log_settings (
  id int primary key default 1,
  monthly_report_enabled boolean default false,
  report_emails text[] default '{}',
  warehouse_address text default '320 E Harry Bridges Blvd, Wilmington, CA 90744',
  customer_address text default '11222 S La Cienega Blvd, Inglewood, CA 90304',
  route_distance_miles numeric(10,2) default 12.4,
  energy_per_mile_kwh numeric(8,4) default 2.5
);
insert into fuel_log_settings (id) values (1) on conflict do nothing;

-- ── Seed fleet vehicles ───────────────────────────────────────────────────────
insert into fleet_vehicles (unit_id, type, capacity_kwh, make, model, year) values
  ('EMV-001', 'emv', 200, 'International', 'eMV Series', 2023),
  ('EMV-002', 'emv', 200, 'International', 'eMV Series', 2023),
  ('EMV-003', 'emv', 200, 'International', 'eMV Series', 2022),
  ('EMV-004', 'emv', 200, 'International', 'eMV Series', 2022),
  ('DSL-001', 'diesel', null, 'International', 'LT Series', 2021),
  ('DSL-002', 'diesel', null, 'International', 'LT Series', 2020)
on conflict do nothing;

-- ── Expenses ──────────────────────────────────────────────────────────────────
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid,                   -- Supabase auth user id
  submitter_name text,                 -- first + last name
  submitter_email text,
  date date not null,
  description text not null,
  category text not null,              -- fuel | maintenance | supplies | meals | lodging | equipment | other
  amount numeric(10,2) not null,
  payment_method text,                 -- company_card | personal_card | cash | check
  receipt_url text,                    -- link to uploaded receipt
  authorized_by text,                  -- name of who authorized
  status text default 'pending',       -- pending | approved | denied
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- ── Expense settings (singleton row id=1) ─────────────────────────────────────
create table if not exists expense_settings (
  id int primary key default 1,
  accounting_emails text[] default '{}',
  auto_notify_accounting boolean default true,
  require_receipt_over numeric(10,2) default 25.00
);
insert into expense_settings (id) values (1) on conflict do nothing;
