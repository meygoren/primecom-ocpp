-- BMS Page Change Requests Migration: requests from the team to change how the
-- BMS Reports page looks or what it analyzes, with Claude's interpretation.
-- Run this in your Supabase SQL editor. Safe to run more than once.

-- status: open | in_progress | done | declined
-- ai: Claude's reading of the request:
--   { kind, title, summary, settings_changes: [...], code_spec, questions: [...], model, at }
CREATE TABLE IF NOT EXISTS bms_change_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  author      text,
  request     text        NOT NULL,
  status      text        NOT NULL DEFAULT 'open',
  ai          jsonb,
  applied_at  timestamptz,
  applied_by  text
);

CREATE INDEX IF NOT EXISTS idx_bms_change_requests_created ON bms_change_requests(created_at DESC);

ALTER TABLE bms_change_requests ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
