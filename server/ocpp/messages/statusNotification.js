const supabase = require('../../db/supabase');
const connections = require('../../state/connections');

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

  // Plug-and-charge auto-start: when a connector enters "Preparing" (vehicle
  // plugged in) and auto_start is enabled for this charger, fire a
  // RemoteStartTransaction automatically so the driver doesn't need to
  // authorise at the charger or in the app.
  if (status === 'Preparing' && connectorId > 0) {
    try {
      const { data: chargerRow } = await supabase
        .from('chargers')
        .select('auto_start_enabled, auto_start_id_tag')
        .eq('charger_id', chargePointId)
        .single();

      if (chargerRow?.auto_start_enabled) {
        // Small delay so the charger finishes its Preparing state before we
        // send the command — some chargers reject immediate remote-start.
        setTimeout(async () => {
          if (!connections.has(chargePointId)) {
            console.log(`[AutoStart] Skipped ${chargePointId} — not connected`);
            return;
          }

          // If the charger already started a session on its own (plug-and-charge
          // or an RFID swipe in the gap), do NOT send RemoteStartTransaction.
          // A remote start aimed at a connector that is already charging makes
          // some firmware tear the running session down a few seconds in.
          const openSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const { data: openSessions } = await supabase
            .from('sessions')
            .select('transaction_id')
            .eq('charger_id', chargePointId)
            .is('stop_time', null)
            .gte('start_time', openSince)
            .limit(1);

          if (openSessions?.length) {
            console.log(
              `[AutoStart] Skipped ${chargePointId} — transaction ${openSessions[0].transaction_id} already running`
            );
            return;
          }

          const remoteStart = require('../commands/remoteStartTransaction');
          const idTag = chargerRow.auto_start_id_tag || 'AUTO';
          try {
            await remoteStart(chargePointId, connectorId, idTag);
            console.log(`[AutoStart] Sent RemoteStartTransaction to ${chargePointId} connector ${connectorId} idTag ${idTag}`);
          } catch (err) {
            console.error(`[AutoStart] RemoteStartTransaction failed for ${chargePointId}:`, err.message);
          }
        }, 2000);
      }
    } catch (err) {
      console.error(`[AutoStart] Check error for ${chargePointId}:`, err.message);
    }
  }

  return {};
}

module.exports = handleStatusNotification;
