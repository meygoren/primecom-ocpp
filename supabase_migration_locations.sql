-- Locations Migration: charging locations (Swift SF), per-location sidebar tabs,
-- battery system detection (Primecom vs SETEC), and per-session charging summaries.
-- Run this in your Supabase SQL editor. Safe to run more than once.

-- ─────────────────────────────────────────────
-- 1. Locations / clients (the "Fleet" dropdown in the sidebar)
-- ─────────────────────────────────────────────
-- dashboard:
--   'standard' — the original all-chargers dashboard (Tower Mobility today)
--   'location' — energy dashboard scoped to this location's chargers only
--                (live kW feed, session summaries, daily kWh)
-- nav_tabs: sidebar paths shown while this location is selected.
--           NULL means "show every tab" (original behavior).
CREATE TABLE IF NOT EXISTS fleets (
  id          text        PRIMARY KEY,
  label       text        NOT NULL,
  city        text,
  color       text        DEFAULT '#47a141',
  dashboard   text        DEFAULT 'standard',
  nav_tabs    text[],
  sort_order  int         DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

INSERT INTO fleets (id, label, city, color, dashboard, nav_tabs, sort_order) VALUES
  ('tower_mobility', 'Tower Mobility', 'Wilmington, CA',    '#47a141', 'standard', NULL, 1),
  ('bali_express',   'Bali Express',   'Los Angeles, CA',   '#3b82f6', 'standard', NULL, 2),
  ('avis_sd',        'Avis SD',        'San Diego, CA',     '#f59e0b', 'standard', NULL, 3),
  ('avis_sf',        'Avis SF',        'San Francisco, CA', '#a855f7', 'standard', NULL, 4),
  ('swift',          'Swift',          'San Francisco, CA', '#06b6d4', 'location', ARRAY['/', '/logs', '/ocpp-config'], 5)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- 2. Charger → location assignment + battery system override
-- ─────────────────────────────────────────────
-- battery_system: 'auto' (detect per session) | 'primecom' | 'setec'
ALTER TABLE chargers
  ADD COLUMN IF NOT EXISTS fleet_id       text REFERENCES fleets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS battery_system text DEFAULT 'auto';

CREATE INDEX IF NOT EXISTS idx_chargers_fleet_id ON chargers(fleet_id);

-- ─────────────────────────────────────────────
-- 3. Battery systems the chargers feed
-- ─────────────────────────────────────────────
-- mac_addresses: battery MACs that identify this system. Chargers using
-- Autocharge send the vehicle/battery MAC as the idTag in StartTransaction.
-- Every Primecom pack shares one MAC; SETEC packs share a different one.
-- Enter them on the Locations page (Battery Systems section).
CREATE TABLE IF NOT EXISTS battery_systems (
  id            text    PRIMARY KEY,
  label         text    NOT NULL,
  capacity_kwh  numeric NOT NULL,
  mac_addresses text[]  DEFAULT '{}',
  color         text,
  sort_order    int     DEFAULT 0
);

INSERT INTO battery_systems (id, label, capacity_kwh, color, sort_order) VALUES
  ('primecom', 'Primecom', 450, '#47a141', 1),
  ('setec',    'SETEC',    240, '#a855f7', 2)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- 4. Per-session charging summary
-- ─────────────────────────────────────────────
-- Updated live while the session is charging (every MeterValues message) and
-- finalised on StopTransaction. Kept on the session row because meter_values
-- is pruned after 60 days but sessions are kept forever.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS meter_start_wh        numeric,
  ADD COLUMN IF NOT EXISTS meter_stop_wh         numeric,
  ADD COLUMN IF NOT EXISTS avg_power_kw          numeric(10,2),
  ADD COLUMN IF NOT EXISTS max_power_kw          numeric(10,2),
  ADD COLUMN IF NOT EXISTS min_power_kw          numeric(10,2),
  ADD COLUMN IF NOT EXISTS power_sample_count    int,
  ADD COLUMN IF NOT EXISTS start_soc             numeric(5,1),
  ADD COLUMN IF NOT EXISTS end_soc               numeric(5,1),
  ADD COLUMN IF NOT EXISTS battery_mac           text,
  ADD COLUMN IF NOT EXISTS battery_system        text,
  ADD COLUMN IF NOT EXISTS battery_system_source text,
  ADD COLUMN IF NOT EXISTS est_capacity_kwh      numeric(10,1);

CREATE INDEX IF NOT EXISTS idx_meter_values_charger_tx ON meter_values(charger_id, transaction_id);
