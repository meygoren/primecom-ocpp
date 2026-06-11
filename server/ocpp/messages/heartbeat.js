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

  return { currentTime: now };
}

module.exports = handleHeartbeat;
