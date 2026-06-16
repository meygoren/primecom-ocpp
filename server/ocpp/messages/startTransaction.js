const supabase = require('../../db/supabase');

// Module-level counter seeded from current time. Incrementing ensures uniqueness
// even when two connectors start within the same second on the same server.
let _txCounter = Math.floor(Date.now() / 1000);
function generateTransactionId() {
  return ++_txCounter;
}

async function handleStartTransaction(chargePointId, payload) {
  const { connectorId, idTag, meterStart, timestamp } = payload;
  const transactionId = generateTransactionId();
  const startTime = timestamp || new Date().toISOString();

  const { error } = await supabase.from('sessions').insert({
    charger_id: chargePointId,
    transaction_id: transactionId,
    connector_id: connectorId,
    id_tag: idTag,
    start_time: startTime,
  });

  if (error) {
    console.error(`[StartTransaction] DB error for ${chargePointId}:`, error.message);
  }

  // Update charger status to charging
  await supabase
    .from('chargers')
    .update({ status: 'charging', last_seen: new Date().toISOString() })
    .eq('charger_id', chargePointId);

  // Auto-assign truck to bay if idTag matches a configured MAC address
  if (idTag) {
    try {
      const { data: profiles } = await supabase
        .from('ef_truck_profiles')
        .select('*');

      if (profiles && profiles.length > 0) {
        const tagLower = idTag.toLowerCase().replace(/[:-]/g, '');
        const match = profiles.find((p) => {
          const pMac = (p.passenger_mac || '').toLowerCase().replace(/[:-]/g, '');
          const dMac = (p.driver_mac || '').toLowerCase().replace(/[:-]/g, '');
          return (pMac && pMac === tagLower) || (dMac && dMac === tagLower);
        });

        if (match) {
          const truckLabel = match.label || `TRUCK ${match.truck_number}`;
          // Find which bay slot this charger belongs to
          const { data: slot } = await supabase
            .from('ef_warehouse_chargers')
            .select('slot')
            .eq('ocpp_id', chargePointId)
            .single();

          if (slot) {
            // Slots 1-2 = Bay A, slots 3-4 = Bay B
            const baySlots = slot.slot <= 2 ? [1, 2] : [3, 4];
            await supabase
              .from('ef_warehouse_chargers')
              .update({ current_truck_label: truckLabel })
              .in('slot', baySlots);
            console.log(`[StartTransaction] Auto-assigned ${truckLabel} to bay slots ${baySlots} via MAC match on ${chargePointId}`);
          }
        }
      }
    } catch (err) {
      console.error('[StartTransaction] Truck auto-assign error:', err.message);
    }
  }

  return {
    transactionId,
    idTagInfo: { status: 'Accepted' },
  };
}

module.exports = handleStartTransaction;
