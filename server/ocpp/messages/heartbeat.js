const supabase = require('../../db/supabase');

async function handleHeartbeat(chargePointId) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('chargers')
    .update({ last_heartbeat: now, last_seen: now })
    .eq('charger_id', chargePointId);

  if (error) {
    console.error(`[Heartbeat] DB error for ${chargePointId}:`, error.message);
  }

  // A live heartbeat stream means the charger is online — self-heal a stale
  // 'offline' badge without clobbering an active charging/faulted state.
  const { error: statusError } = await supabase
    .from('chargers')
    .update({ status: 'online' })
    .eq('charger_id', chargePointId)
    .neq('status', 'charging')
    .neq('status', 'faulted');

  if (statusError) {
    console.error(`[Heartbeat] Status update error for ${chargePointId}:`, statusError.message);
  }

  return { currentTime: now };
}

module.exports = handleHeartbeat;
