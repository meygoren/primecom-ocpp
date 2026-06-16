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

  const mappedStatus = mapStatus(status);

  // Auto-update connector_count if this StatusNotification is for a higher
  // connector ID than what's currently stored.  connectorId 0 = charger itself.
  const updates = { status: mappedStatus, last_seen: now };

  if (connectorId && connectorId > 0) {
    // Fetch current connector_count and bump it if needed
    const { data: current } = await supabase
      .from('chargers')
      .select('connector_count')
      .eq('charger_id', chargePointId)
      .single();

    const currentCount = current?.connector_count ?? 1;
    if (connectorId > currentCount) {
      updates.connector_count = connectorId;
    }
  }

  const { error } = await supabase
    .from('chargers')
    .update(updates)
    .eq('charger_id', chargePointId);

  if (error) {
    console.error(`[StatusNotification] DB error for ${chargePointId}:`, error.message);
  }

  return {};
}

module.exports = handleStatusNotification;
