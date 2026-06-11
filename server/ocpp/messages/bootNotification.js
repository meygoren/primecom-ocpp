const supabase = require('../../db/supabase');

async function handleBootNotification(chargePointId, payload) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('chargers')
    .upsert(
      {
        charger_id: chargePointId,
        vendor: payload.chargePointVendor || null,
        model: payload.chargePointModel || null,
        serial_number: payload.chargePointSerialNumber || null,
        firmware_version: payload.firmwareVersion || null,
        status: 'online',
        last_seen: now,
        last_heartbeat: now,
      },
      { onConflict: 'charger_id' }
    );

  if (error) {
    console.error(`[BootNotification] DB error for ${chargePointId}:`, error.message);
  }

  return {
    currentTime: now,
    interval: 60,
    status: 'Accepted',
  };
}

module.exports = handleBootNotification;
