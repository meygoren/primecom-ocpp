-- BMS Page Change Requests Migration: requests from the team to change how the
-- BMS Reports page looks or what it analyzes, with Claude's interpretation.
-- Nothing a request proposes is applied until an admin approves it; admins
-- are emailed about every new request.
-- Run this in your Supabase SQL editor. Safe to run more than once.

-- status: pending (waiting for an admin) | approved | in_progress | done | declined
-- ai: Claude's reading of the request:
--   { kind, title, summary, settings_changes: [...], code_spec, questions: [...], model, at }
CREATE TABLE IF NOT EXISTS bms_change_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  author      text,
  request     text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending',
  ai          jsonb,
  applied_at  timestamptz,
  applied_by  text
);

ALTER TABLE bms_change_requests
  ADD COLUMN IF NOT EXISTS requester_name text,
  ADD COLUMN IF NOT EXISTS decided_at     timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by     text,
  ADD COLUMN IF NOT EXISTS decision_note  text;

ALTER TABLE bms_change_requests ALTER COLUMN status SET DEFAULT 'pending';
UPDATE bms_change_requests SET status = 'pending' WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_bms_change_requests_created ON bms_change_requests(created_at DESC);

ALTER TABLE bms_change_requests ENABLE ROW LEVEL SECURITY;

-- Who is emailed about new requests. Empty = every admin account.
-- (app_ai_settings comes from supabase_migration_bms_ai.sql.)
ALTER TABLE app_ai_settings ADD COLUMN IF NOT EXISTS request_notify_emails text[] DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
