const supabase = require('../../db/supabase');

async function handleDataTransfer(chargePointId, payload) {
  const { vendorId, messageId, data } = payload;

  // Parse GPS location updates sent by Primecom chargers
  if (vendorId === 'Primecom' && messageId === 'GPS') {
    try {
      const gps = typeof data === 'string' ? JSON.parse(data) : data;
      if (gps && gps.lat != null && gps.lng != null) {
        await supabase.from('truck_locations').insert({
          charger_id: chargePointId,
          lat: parseFloat(gps.lat),
          lng: parseFloat(gps.lng),
          speed_mph: gps.speed != null ? parseFloat(gps.speed) : null,
          heading: gps.heading != null ? parseFloat(gps.heading) : null,
          accuracy_m: gps.accuracy != null ? parseFloat(gps.accuracy) : null,
          recorded_at: gps.timestamp || new Date().toISOString(),
        });
        console.log(`[DataTransfer] GPS saved for ${chargePointId}: ${gps.lat},${gps.lng}`);
      }
    } catch (err) {
      console.error(`[DataTransfer] GPS parse error for ${chargePointId}:`, err.message);
    }
  }

  // GetVIN response — log the VIN data returned
  if (vendorId === 'Primecom' && messageId === 'GetVIN') {
    console.log(`[DataTransfer] GetVIN response from ${chargePointId}:`, data);
  }

  return { status: 'Accepted' };
}

module.exports = handleDataTransfer;
