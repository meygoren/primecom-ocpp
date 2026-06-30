-- Log Retention Migration: tiered cleanup for ocpp_logs / meter_values
-- Run this in your Supabase SQL editor.
--
-- IMPORTANT: this file is two separate parts. Run Part 1 first (paste and run it on
-- its own), confirm it succeeds, then run Part 2 separately. Pasting both parts
-- together in one query will fail — the SQL editor sends a multi-statement paste to
-- Postgres as a single implicit transaction, and VACUUM cannot run inside any
-- transaction. If you accidentally run both together and hit that error, Part 1's
-- statements were rolled back too (not just VACUUM) — go back and run Part 1 alone
-- first to confirm it actually committed.
--
-- Retention policy:
--   - ocpp_logs, action = 'Heartbeat'    -> 7 days  (pure liveness pings, no billing/audit value)
--   - ocpp_logs, everything else         -> 60 days (BootNotification, StatusNotification,
--                                           StartTransaction, StopTransaction, MeterValues,
--                                           Authorize, FirmwareStatusNotification, DataTransfer,
--                                           etc. — all potentially useful for billing disputes
--                                           or fault audits)
--   - meter_values (structured readings) -> 60 days (the actual energy data billing reconciles
--                                           against)
--   - sessions                           -> left alone, NOT pruned here. One row per charge
--                                           session (tiny), and it's the real billing record —
--                                           no reason to delete it on a timer.
--
-- Runs automatically every night at 03:00 UTC via pg_cron, so this doesn't depend on the
-- Node server being up.

-- ═════════════════════════════════════════════
-- PART 1 — run this block on its own first
-- ═════════════════════════════════════════════

-- 1. Make sure pg_cron is available
--    (If this errors with a permissions message, enable it instead via
--    Supabase Dashboard → Database → Extensions → pg_cron, then re-run from step 2.)
create extension if not exists pg_cron with schema extensions;

-- 2. Cleanup function
create or replace function cleanup_ocpp_data()
returns void
language plpgsql
as $$
begin
  delete from ocpp_logs
  where action = 'Heartbeat'
    and created_at < now() - interval '7 days';

  delete from ocpp_logs
  where action is distinct from 'Heartbeat'
    and created_at < now() - interval '60 days';

  delete from meter_values
  where "timestamp" < now() - interval '60 days';
end;
$$;

-- 3. Schedule it nightly (idempotent — drops any existing job with this name first)
select cron.unschedule(jobid)
from cron.job
where jobname = 'cleanup-ocpp-data';

select cron.schedule(
  'cleanup-ocpp-data',
  '0 3 * * *',
  $$select cleanup_ocpp_data();$$
);

-- 4. Run it once now to reclaim space immediately, instead of waiting for tonight's run
select cleanup_ocpp_data();

-- ═════════════════════════════════════════════
-- PART 2 — after Part 1 succeeds, clear the editor and run this block separately
-- ═════════════════════════════════════════════

-- 5. Reclaim disk space on disk.
--    A DELETE only marks rows as dead — it doesn't shrink the table file by itself.
--    This is what makes the "Database Size" usage number actually drop.
vacuum (verbose, analyze) ocpp_logs;
vacuum (verbose, analyze) meter_values;
