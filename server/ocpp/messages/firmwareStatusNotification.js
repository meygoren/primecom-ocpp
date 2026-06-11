const supabase = require('../../db/supabase');

async function handleFirmwareStatusNotification(chargePointId, payload) {
  const { status } = payload;
  const now = new Date().toISOString();

  // Update the most recent pending firmware update for this charger
  const { error } = await supabase
    .from('firmware_updates')
    .update({ status: status.toLowerCase(), status_updated: now })
    .eq('charger_id', chargePointId)
    .in('status', ['pending', 'downloading', 'downloaded', 'installing'])
    .order('requested_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error(`[FirmwareStatusNotification] DB error for ${chargePointId}:`, error.message);
  }

  return {};
}

module.exports = handleFirmwareStatusNotification;
