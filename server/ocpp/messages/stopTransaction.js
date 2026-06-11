const supabase = require('../../db/supabase');

async function handleStopTransaction(chargePointId, payload) {
  const { transactionId, meterStop, timestamp, reason, idTag } = payload;
  const stopTime = timestamp || new Date().toISOString();

  // Fetch session to calculate energy delivered
  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('*')
    .eq('charger_id', chargePointId)
    .eq('transaction_id', transactionId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error(`[StopTransaction] Fetch error for ${chargePointId}:`, fetchError.message);
  }

  // Calculate energy in kWh from meter values (Wh → kWh)
  let energyKwh = null;
  if (session && meterStop != null) {
    // meterStart is not stored directly but can be derived from meter_values
    // For now we store the raw meterStop value; energy calc can be enriched later
    energyKwh = meterStop / 1000;
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

  return {
    idTagInfo: { status: 'Accepted' },
  };
}

module.exports = handleStopTransaction;
