const supabase = require('../../db/supabase');

// Maps OCPP connector status to our internal status
function mapStatus(ocppStatus) {
  switch (ocppStatus) {
    case 'Available':
      return 'online';
    case 'Charging':
    case 'SuspendedEV':
    case 'SuspendedEVSE':
      return 'charging';
    case 'Faulted':
      return 'faulted';
    case 'Unavailable':
    case 'Finishing':
    case 'Preparing':
    case 'Reserved':
      return 'online';
    default:
      return 'online';
  }
}

async function handleStatusNotification(chargePointId, payload) {
  const { connectorId, status, errorCode, info, timestamp } = payload;
  const now = new Date().toISOString();

  // Only update charger-level status from connector 0 or connector 1
  // Connector 0 = the charger itself; connector 1+ = individual ports
  const mappedStatus = mapStatus(status);

  const { error } = await supabase
    .from('chargers')
    .update({
      status: mappedStatus,
      last_seen: now,
    })
    .eq('charger_id', chargePointId);

  if (error) {
    console.error(`[StatusNotification] DB error for ${chargePointId}:`, error.message);
  }

  return {};
}

module.exports = handleStatusNotification;
