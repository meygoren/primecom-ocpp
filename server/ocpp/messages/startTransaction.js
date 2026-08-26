const supabase = require('../../db/supabase');

// --- Transaction ID generation -------------------------------------------
//
// OCPP 1.6 lets the Central System pick any integer, but charger firmware is
// not always so relaxed: several units store the transactionId in a small
// fixed-width field and misbehave (or drop the session) when handed a huge
// number. We therefore hand out small, sequential IDs (1, 2, 3 ...) the way
// every reference Central System does.
//
// The counter is seeded once at startup from the highest small ID already in
// the sessions table, so IDs stay unique across server restarts. Older
// epoch-based IDs (roughly 1.7 billion) are excluded from the seed lookup so
// one legacy row does not push the counter back into the huge range.
const MAX_LEGACY_SAFE_ID = 1000000;

let _txCounter = 0;
let _seedPromise = null;

function seedTransactionCounter() {
  if (!_seedPromise) {
    _seedPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('transaction_id')
          .lt('transaction_id', MAX_LEGACY_SAFE_ID)
          .order('transaction_id', { ascending: false })
          .limit(1);

        if (error) throw new Error(error.message);
        _txCounter = data?.[0]?.transaction_id || 0;
        console.log(`[StartTransaction] Transaction ID counter seeded at ${_txCounter}`);
      } catch (err) {
        // Fall back to a mid-range starting point rather than risk colliding
        // with existing rows. Still small enough for any charger firmware.
        _txCounter = 100000;
        console.error('[StartTransaction] Counter seed failed, starting at 100000:', err.message);
      }
    })();
  }
  return _seedPromise;
}

// Warm the counter as soon as the server boots so the first real transaction
// never has to wait on the database for its ID.
seedTransactionCounter();

async function generateTransactionId() {
  await seedTransactionCounter();
  return ++_txCounter;
}

async function handleStartTransaction(chargePointId, payload) {
  const { connectorId, idTag, meterStart, timestamp } = payload;
  const transactionId = await generateTransactionId();
  const startTime = timestamp || new Date().toISOString();

  console.log(
    `[StartTransaction] ${chargePointId} connector ${connectorId} idTag "${idTag}" ` +
      `meterStart ${meterStart} → transactionId ${transactionId} (Accepted)`
  );

  // Everything below is bookkeeping. It runs in the background so the charger
  // gets its transactionId immediately — a slow database must never delay the
  // reply, because a charger that does not get StartTransaction.conf in time
  // aborts the session it just started.
  persistStartTransaction(chargePointId, payload, transactionId, startTime).catch((err) => {
    console.error(`[StartTransaction] Background persist failed for ${chargePointId}:`, err.message);
  });

  return {
    transactionId,
    idTagInfo: { status: 'Accepted' },
  };
}

async function persistStartTransaction(chargePointId, payload, transactionId, startTime) {
  const { connectorId, idTag } = payload;

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

  // Auto Transfer VIN — send DataTransfer(GetVIN) if enabled for this charger.
  // Delayed well past the start of the session: some firmware handles a
  // vendor DataTransfer badly while it is still bringing the session up.
  try {
    const { data: chargerRow } = await supabase
      .from('chargers')
      .select('auto_transfer_vin_enabled')
      .eq('charger_id', chargePointId)
      .single();

    if (chargerRow?.auto_transfer_vin_enabled) {
      const { sendCommand } = require('../commands/sendCommand');
      setTimeout(async () => {
        try {
          await sendCommand(chargePointId, 'DataTransfer', {
            vendorId: 'Primecom',
            messageId: 'GetVIN',
            data: '',
          });
          console.log(`[StartTransaction] Auto Transfer VIN sent to ${chargePointId}`);
        } catch (err) {
          console.error(`[StartTransaction] Auto Transfer VIN failed for ${chargePointId}:`, err.message);
        }
      }, 30000);
    }
  } catch (err) {
    console.error('[StartTransaction] Auto Transfer VIN check error:', err.message);
  }
}

module.exports = handleStartTransaction;
