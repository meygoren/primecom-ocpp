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
    await checkChargeTruckAlert(chargePointId, latestSoc);
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

async function checkChargeTruckAlert(chargePointId, soc) {
  try {
    // Find trucks where this charger_id matches any OCPP slot
    const { data: trucks } = await supabase
      .from('charge_trucks')
      .select('*')
      .or(`p_ocpp_1.eq.${chargePointId},p_ocpp_2.eq.${chargePointId},d_ocpp_1.eq.${chargePointId},d_ocpp_2.eq.${chargePointId}`);

    if (!trucks?.length) return;

    for (const truck of trucks) {
      const side = (truck.p_ocpp_1 === chargePointId || truck.p_ocpp_2 === chargePointId) ? 'passenger' : 'driver';
      const threshold = truck.soc_alert_threshold || 80;
      if (soc < threshold) continue;

      // Dedup: skip if alert sent in last 2 hours for this truck+side
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase.from('ef_alert_log')
        .select('id').eq('truck_number', truck.truck_number).eq('side', side)
        .gte('sent_at', twoHoursAgo).limit(1);
      if (recent?.length) continue;

      // Get other side's SOC
      const otherSideOcppId = side === 'passenger' ? (truck.d_ocpp_1 || truck.d_ocpp_2) : (truck.p_ocpp_1 || truck.p_ocpp_2);
      let otherSoc = null;
      if (otherSideOcppId) {
        const { data: otherData } = await supabase.from('meter_values')
          .select('value').eq('charger_id', otherSideOcppId).eq('measurand', 'SoC')
          .order('timestamp', { ascending: false }).limit(1);
        otherSoc = otherData?.[0]?.value ?? null;
      }

      const { data: supervisors } = await supabase.from('ef_supervisors').select('*').eq('active', true);
      if (!supervisors?.length) { console.log('[ChargeTruck Alert] No active supervisors'); continue; }

      const sideLabel = side === 'passenger' ? 'Passenger' : 'Driver';
      const otherLabel = side === 'passenger' ? 'Driver' : 'Passenger';
      const truckLabel = truck.label || `Truck ${truck.truck_number}`;
      const msg = `${truckLabel} ${sideLabel} reached ${Math.round(soc)}%${otherSoc !== null ? `, ${otherLabel} is at ${Math.round(otherSoc)}%` : ''}. Ready for deployment.`;

      const { sendSms, sendEmail } = require('../services/alertService');
      for (const sup of supervisors) {
        if (sup.phone) await sendSms(sup.phone, msg);
        if (sup.email) await sendEmail(sup.email, `SOC Alert: ${truckLabel}`, msg);
      }

      await supabase.from('ef_alert_log').insert({ truck_number: truck.truck_number, side, soc: Math.round(soc), threshold });
      console.log(`[ChargeTruck Alert] Sent for ${truckLabel} ${side}: ${Math.round(soc)}%`);
    }
  } catch (err) {
    console.error('[ChargeTruck Alert] Error:', err.message);
  }
}

module.exports = handleMeterValues;
