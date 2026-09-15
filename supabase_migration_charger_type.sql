-- Charger Type migration
-- Different charger vendors respond differently to the same OCPP commands
-- (e.g. proprietary ChangeConfiguration keys for current limits). This lets
-- each charger be tagged with a type so the server knows which command
-- mechanics actually work on it. Keys here must match server/ocpp/chargerProfiles.js.
-- Run this in your Supabase SQL editor.

ALTER TABLE chargers
  ADD COLUMN IF NOT EXISTS charger_type text DEFAULT 'primecom_default';

UPDATE chargers SET charger_type = 'primecom_default' WHERE charger_type IS NULL;
