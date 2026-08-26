const supabase = require('../../db/supabase');

// A session that dies this fast was not a normal unplug — it is the symptom
// we chase when a charger charges fine standalone but stops seconds after
// starting once OCPP is connected.
const SUSPICIOUSLY_SHORT_SESSION_MS = 60 * 1000;

async function handleStopTransaction(chargePointId, payload) {
  const { transactionId, meterStop, timestamp, reason, idTag } = payload;
  const stopTime = timestamp || new Date().toISOString();

  console.log(
    `[StopTransaction] ${chargePointId} transaction ${transactionId} stopped — ` +
      `reason "${reason || 'none given'}" meterStop ${meterStop} idTag "${idTag || ''}"`
  );

  // Reply immediately; the charger is waiting. Bookkeeping runs after.
  persistStopTransaction(chargePointId, payload, stopTime).catch((err) => {
    console.error(`[StopTransaction] Background persist failed for ${chargePointId}:`, err.message);
  });

  return {
    idTagInfo: { status: 'Accepted' },
  };
}

// The matching session row is written in the background when the transaction
// starts. A session that stops within a second or two can therefore arrive
// before that insert has landed, so look again a few times before giving up.
async function fetchSessionWithRetry(chargePointId, transactionId, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('charger_id', chargePointId)
      .eq('transaction_id', transactionId)
      .maybeSingle();

    if (error) {
      console.error(`[StopTransaction] Fetch error for ${chargePointId}:`, error.message);
      return null;
    }
    if (data) return data;

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.warn(
    `[StopTransaction] No session row found for ${chargePointId} transaction ${transactionId} after ${attempts} tries`
  );
  return null;
}

async function persistStopTransaction(chargePointId, payload, stopTime) {
  const { transactionId, meterStop, reason } = payload;

  // Fetch session to calculate energy delivered
  const session = await fetchSessionWithRetry(chargePointId, transactionId);

  // Calculate energy in kWh from meter values (Wh → kWh)
  let energyKwh = null;
  if (session && meterStop != null) {
    // meterStart is not stored directly but can be derived from meter_values
    // For now we store the raw meterStop value; energy calc can be enriched later
    energyKwh = meterStop / 1000;
  }

  // Flag sessions that ended almost as soon as they began — this is what a
  // rejected authorisation or a missed StartTransaction reply looks like.
  if (session?.start_time) {
    const durationMs = new Date(stopTime) - new Date(session.start_time);
    if (durationMs >= 0 && durationMs < SUSPICIOUSLY_SHORT_SESSION_MS) {
      console.warn(
        `[StopTransaction] ${chargePointId} transaction ${transactionId} lasted only ` +
          `${Math.round(durationMs / 1000)}s (reason "${reason || 'none given'}"). ` +
          'Check the Logs page for the Authorize/StartTransaction exchange just before this stop.'
      );
    }
  }

  const { error: updateError } = await supabase
    .from('sessions')
    .update({
      stop_time: stopTime,
      energy_kwh: energyKwh,
      stop_reason: reason || null,
    })
    .eq('charger_id', chargePointId)
    .eq('transaction_id', transactionId);

  if (updateError) {
    console.error(`[StopTransaction] Update error for ${chargePointId}:`, updateError.message);
  }

  // Update charger status back to online
  await supabase
    .from('chargers')
    .update({ status: 'online', last_seen: new Date().toISOString() })
    .eq('charger_id', chargePointId);
}

module.exports = handleStopTransaction;
