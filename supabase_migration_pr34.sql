-- PR #34 Migration: Fleet & Assets, Customers, Incidents
-- Run this in your Supabase SQL editor

-- ─────────────────────────────────────────────
-- 1. Extend fleet_vehicles (created in PR #33)
-- ─────────────────────────────────────────────
ALTER TABLE fleet_vehicles
  ADD COLUMN IF NOT EXISTS current_soc_pct  int,
  ADD COLUMN IF NOT EXISTS last_service_date date,
  ADD COLUMN IF NOT EXISTS odometer_miles    int,
  ADD COLUMN IF NOT EXISTS status            text DEFAULT 'active';

-- Update existing seeds with starting values
UPDATE fleet_vehicles SET status = 'active'     WHERE status IS NULL;
UPDATE fleet_vehicles SET current_soc_pct = 80  WHERE vehicle_type = 'electric' AND current_soc_pct IS NULL;
UPDATE fleet_vehicles SET odometer_miles = 0     WHERE odometer_miles IS NULL;

-- ─────────────────────────────────────────────
-- 2. Maintenance logs
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id        uuid        REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  date              date        NOT NULL,
  type              text        NOT NULL,
  description       text,
  cost              numeric(10,2),
  performed_by      text,
  next_service_date date,
  notes             text,
  created_at        timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 3. Customer accounts
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_accounts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  fleet_type    text        DEFAULT 'electric',
  vehicle_count int         DEFAULT 0,
  status        text        DEFAULT 'active',
  notes         text,
  created_at    timestamptz DEFAULT now()
);

-- Seed the 4 known customers
INSERT INTO customer_accounts (name, contact_name, email, phone, address, fleet_type, vehicle_count, status, notes)
VALUES
  ('Tower Mobility',  'Alex Torres',       'alex@towermobility.com', '(213) 555-0100', '320 E Harry Bridges Blvd, Wilmington, CA 90744', 'electric', 6, 'active',   'Primary customer. 4 International EMVs + 2 diesel backup trucks.'),
  ('Bali Express',    'Dewi Santoso',      'dewi@baliexpress.com',   '(310) 555-0200', 'Los Angeles, CA',   'mixed',    0, 'prospect', 'In discussion. Mixed delivery fleet.'),
  ('Avis SD',         'Maria Gutierrez',   'mgutierrez@avissd.com',  '(619) 555-0300', 'San Diego, CA',     'electric', 0, 'prospect', 'SD location. EV rental fleet expansion planned Q3 2026.'),
  ('Avis SF',         'James Chen',        'jchen@avissf.com',       '(415) 555-0400', 'San Francisco, CA', 'electric', 0, 'prospect', 'SF location. Interest in DC fast charger installation.')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 4. Incident reports
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_reports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date            date        NOT NULL,
  time            time,
  vehicle_id      uuid        REFERENCES fleet_vehicles(id) ON DELETE SET NULL,
  driver_name     text,
  incident_type   text        NOT NULL,
  severity        text        DEFAULT 'low',
  location        text,
  description     text        NOT NULL,
  injuries        text,
  property_damage text,
  witnesses       text,
  reported_by     text,
  status          text        DEFAULT 'open',
  resolution      text,
  created_at      timestamptz DEFAULT now()
);
