-- Log Retention Migration: tiered cleanup for ocpp_logs / meter_values
-- Run this in your Supabase SQL editor.
--
-- IMPORTANT: the Supabase Studio SQL editor always executes queries inside its own
-- wrapped transaction, and VACUUM can never run inside any transaction — so VACUUM
-- cannot be run from this editor at all, no matter how you split the statements.
-- That's fine: you don't need to run it manually. The DELETEs below are the
-- substantive cleanup; Postgres's autovacuum (enabled by default on every Supabase
-- project) reclaims the freed disk space on its own shortly after a bulk delete like
-- this, typically within a few minutes, with zero action required. The "Database
-- Size" number on the Usage page reflects that after its own refresh delay (up to an
-- hour, per Supabase's note on that page).
--
-- To confirm autovacuum has caught up, run (this is a plain read, not blocked by the
-- transaction-wrapping issue above):
--   select relname, n_dead_tup, last_autovacuum
--   from pg_stat_user_tables
--   where relname in ('ocpp_logs', 'meter_values');
--
-- If you ever need to force a VACUUM immediately (e.g. for a much larger one-time
-- cleanup), the only reliable way is connecting with a direct Postgres client (psql,
-- TablePlus, DBeaver) using the connection string from Project Settings → Database,
-- rather than the web SQL editor.
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

-- 4. Run it once now to reclaim space immediately, instead of waiting for tonight's run.
--    Disk space is reclaimed automatically afterward by autovacuum — see the note at
--    the top of this file. No further manual step is needed.
select cleanup_ocpp_data();
