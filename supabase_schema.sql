-- Primecom OCPP Platform — Supabase Schema
-- Run this in the Supabase SQL editor to create all required tables.

create table if not exists chargers (
  id              uuid primary key default gen_random_uuid(),
  charger_id      text unique not null,
  vendor          text,
  model           text,
  serial_number   text,
  firmware_version text,
  status          text default 'offline',
  last_heartbeat  timestamptz,
  last_seen       timestamptz,
  connector_count int default 1,
  location_label  text,
  notes           text,
  created_at      timestamptz default now()
);

create table if not exists sessions (
  id              uuid primary key default gen_random_uuid(),
  charger_id      text references chargers(charger_id),
  transaction_id  int,
  connector_id    int,
  id_tag          text,
  start_time      timestamptz,
  stop_time       timestamptz,
  energy_kwh      numeric(10,3),
  stop_reason     text,
  created_at      timestamptz default now()
);

create table if not exists meter_values (
  id              uuid primary key default gen_random_uuid(),
  charger_id      text references chargers(charger_id),
  transaction_id  int,
  timestamp       timestamptz,
  measurand       text,
  value           numeric,
  unit            text,
  context         text,
  created_at      timestamptz default now()
);

create table if not exists ocpp_logs (
  id              uuid primary key default gen_random_uuid(),
  charger_id      text,
  direction       text,
  message_type    int,
  action          text,
  message_id      text,
  payload         jsonb,
  created_at      timestamptz default now()
);

create table if not exists firmware_updates (
  id              uuid primary key default gen_random_uuid(),
  charger_id      text references chargers(charger_id),
  firmware_url    text,
  requested_at    timestamptz,
  status          text default 'pending',
  status_updated  timestamptz,
  notes           text
);

-- Indexes for common query patterns
create index if not exists idx_sessions_charger_id on sessions(charger_id);
create index if not exists idx_sessions_start_time on sessions(start_time desc);
create index if not exists idx_meter_values_charger_id on meter_values(charger_id);
create index if not exists idx_meter_values_transaction_id on meter_values(transaction_id);
create index if not exists idx_ocpp_logs_charger_id on ocpp_logs(charger_id);
create index if not exists idx_ocpp_logs_created_at on ocpp_logs(created_at desc);
create index if not exists idx_firmware_updates_charger_id on firmware_updates(charger_id);
