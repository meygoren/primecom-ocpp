const supabase = require('../../db/supabase');

async function handleMeterValues(chargePointId, payload) {
  const { transactionId, meterValue } = payload;

  if (!meterValue || !Array.isArray(meterValue)) {
    return {};
  }

  const rows = [];
  let latestSoc = null;

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

      if (sv.measurand === 'SoC') {
        latestSoc = parseFloat(sv.value);
      }
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('meter_values').insert(rows);
    if (error) {
      console.error(`[MeterValues] DB error for ${chargePointId}:`, error.message);
    }
  }

  if (latestSoc !== null) {
    await checkSocThreshold(chargePointId, latestSoc);
  }

  return {};
}

async function checkSocThreshold(chargePointId, soc) {
  try {
    // Find all drivers assigned to this charger
    const { data: assignments } = await supabase
      .from('charger_assignments')
      .select('user_id')
      .eq('charger_id', chargePointId);

    if (!assignments?.length) return;

    const userIds = assignments.map((a) => a.user_id);

    // Get driver preferences for these users
    const { data: prefs } = await supabase
      .from('driver_preferences')
      .select('user_id, soc_threshold')
      .in('user_id', userIds);

    for (const userId of userIds) {
      const pref = prefs?.find((p) => p.user_id === userId);
      const threshold = pref?.soc_threshold ?? 90;

      if (soc < threshold) continue;

      // Dedup: skip if a notification was sent in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('charger_id', chargePointId)
        .eq('type', 'soc_threshold')
        .gte('created_at', oneHourAgo)
        .limit(1);

      if (recent?.length) continue;

      await supabase.from('notifications').insert({
        user_id: userId,
        charger_id: chargePointId,
        type: 'soc_threshold',
        message: `Charger ${chargePointId} reached ${Math.round(soc)}% charge (threshold: ${threshold}%)`,
        read: false,
      });

      console.log(`[SOC] Notification sent to ${userId}: ${chargePointId} at ${soc}%`);
    }
  } catch (err) {
    console.error('[SOC] Threshold check error:', err.message);
  }
}

module.exports = handleMeterValues;
