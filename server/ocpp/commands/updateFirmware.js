const { sendCommand } = require('./sendCommand');
const supabase = require('../../db/supabase');

async function updateFirmware(chargePointId, location, retrieveDate) {
  // Record the firmware update request before sending
  await supabase.from('firmware_updates').insert({
    charger_id: chargePointId,
    firmware_url: location,
    requested_at: new Date().toISOString(),
    status: 'pending',
  });

  return sendCommand(chargePointId, 'UpdateFirmware', {
    location,
    retrieveDate: retrieveDate || new Date().toISOString(),
    retries: 3,
    retryInterval: 60,
  });
}

module.exports = updateFirmware;
