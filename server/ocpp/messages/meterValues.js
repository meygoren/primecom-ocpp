const supabase = require('../../db/supabase');

async function handleMeterValues(chargePointId, payload) {
  const { connectorId, transactionId, meterValue } = payload;

  if (!meterValue || !Array.isArray(meterValue)) {
    return {};
  }

  const rows = [];

  for (const mv of meterValue) {
    const ts = mv.timestamp || new Date().toISOString();

    if (!mv.sampledValue || !Array.isArray(mv.sampledValue)) continue;

    for (const sv of mv.sampledValue) {
      rows.push({
        charger_id: chargePointId,
        transaction_id: transactionId || null,
        timestamp: ts,
        measurand: sv.measurand || 'Energy.Active.Import.Register',
        value: parseFloat(sv.value) || 0,
        unit: sv.unit || null,
        context: sv.context || null,
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('meter_values').insert(rows);
    if (error) {
      console.error(`[MeterValues] DB error for ${chargePointId}:`, error.message);
    }
  }

  return {};
}

module.exports = handleMeterValues;
