-- Truck GPS location tracking
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS truck_locations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  charger_id   text        NOT NULL,
  lat          numeric(10, 7) NOT NULL,
  lng          numeric(11, 7) NOT NULL,
  speed_mph    numeric(6, 1),
  heading      numeric(5, 1),   -- degrees 0-359
  accuracy_m   numeric(8, 1),   -- GPS accuracy in metres
  recorded_at  timestamptz NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- Fast latest-per-charger lookup
CREATE INDEX IF NOT EXISTS idx_truck_locations_charger_time
  ON truck_locations (charger_id, recorded_at DESC);

-- Optional: auto-prune rows older than 30 days to keep the table lean
-- You can set up a pg_cron job or Supabase scheduled function for this:
-- DELETE FROM truck_locations WHERE created_at < now() - INTERVAL '30 days';
