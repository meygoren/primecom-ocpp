-- BMS Reports + Claude Migration: Claude analysis per report, a chat thread per
-- report, and the Anthropic API key / model setting.
-- Run this in your Supabase SQL editor. Safe to run more than once.

-- Claude's written analysis of a report, one per language:
--   { "en": { "text": "...", "model": "...", "at": "..." }, "zh": { ... } }
ALTER TABLE bms_reports ADD COLUMN IF NOT EXISTS ai_analysis jsonb;

-- Team chat with Claude about one report. Shared by everyone who opens it.
CREATE TABLE IF NOT EXISTS bms_chat (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid        NOT NULL REFERENCES bms_reports(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text        NOT NULL,
  author     text,                         -- email of the person who asked
  model      text,                         -- model that answered (assistant rows)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bms_chat_report ON bms_chat(report_id, created_at);

-- Anthropic API key and model. Single row (id = 1). Only the server reads this:
-- row level security is on with no policies, so the public (anon) key used by
-- the browser cannot read it. An ANTHROPIC_API_KEY variable set on the Railway
-- server takes priority over the key stored here.
CREATE TABLE IF NOT EXISTS app_ai_settings (
  id                int         PRIMARY KEY DEFAULT 1,
  anthropic_api_key text,
  model             text        DEFAULT 'claude-opus-5-5',
  updated_at        timestamptz DEFAULT now(),
  updated_by        text,
  CONSTRAINT app_ai_settings_single_row CHECK (id = 1)
);

ALTER TABLE app_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bms_chat ENABLE ROW LEVEL SECURITY;

INSERT INTO app_ai_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
