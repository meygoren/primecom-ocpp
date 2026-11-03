-- BMS Reports Migration: uploaded battery BMS logs (.xlsx exports from the
-- online BMS platform) and the analysis settings for the BMS Reports tab.
-- Run this in your Supabase SQL editor. Safe to run more than once.

-- One row per uploaded file. The original spreadsheet is not kept; instead the
-- useful fields are extracted into `data` (one array per field) plus per-cell
-- statistics, so the analysis can be re-run whenever settings or the analysis
-- code change.
CREATE TABLE IF NOT EXISTS bms_reports (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz DEFAULT now(),
  uploaded_by      text,
  file_name        text,
  hwid             text,                    -- battery hardware ID from the file
  label            text,                    -- friendly battery name, e.g. "Primecom Unit 3"
  vehicle          text,                    -- vehicles it was charging, e.g. "Hyundai Ioniq 5"
  notes            text,
  project_name     text,
  device_model     text,
  software_version text,
  start_time       timestamptz,
  end_time         timestamptz,
  row_count        int,
  meta             jsonb,
  data             jsonb,                   -- extracted time series (column arrays)
  cell_stats       jsonb,                   -- per-cell voltage statistics
  temp_stats       jsonb,                   -- per-sensor temperature statistics
  summary          jsonb                    -- headline numbers for the reports list
);

CREATE INDEX IF NOT EXISTS idx_bms_reports_hwid ON bms_reports(hwid, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_bms_reports_start ON bms_reports(start_time DESC);

-- Shared settings for the analysis: which sections are shown, limits and
-- warning thresholds. Single row (id = 1).
CREATE TABLE IF NOT EXISTS bms_settings (
  id         int         PRIMARY KEY DEFAULT 1,
  settings   jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT bms_settings_single_row CHECK (id = 1)
);

INSERT INTO bms_settings (id, settings) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;
