const supabase = require('../db/supabase');

function buildConnectorList(sessions, mvRows) {
  const latestMv = {};
  for (const row of (mvRows || [])) {
    const key = `${row.transaction_id}:${row.measurand}`;
    if (!latestMv[key]) latestMv[key] = row;
  }

  return [...sessions]
    .sort((a, b) => a.connector_id - b.connector_id)
    .map((session) => {
      const powerRow = latestMv[`${session.transaction_id}:Power.Active.Import`];
      const tempRow =
        latestMv[`${session.transaction_id}:Temperature`] ||
        latestMv[`${session.transaction_id}:DC.Temperature`] ||
        latestMv[`${session.transaction_id}:CableTemp`] ||
        latestMv[`${session.transaction_id}:ConnectorTemp`];
      let power_kw = null;
      if (powerRow) {
        const val = parseFloat(powerRow.value);
        power_kw = powerRow.unit === 'W' ? val / 1000 : val;
      }
      return {
        connector_id: session.connector_id,
        transaction_id: session.transaction_id,
        power_kw,
        temperature: tempRow ? parseFloat(tempRow.value) : null,
      };
    });
}

async function getConnectorLiveData(chargerId) {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('connector_id, transaction_id')
    .eq('charger_id', chargerId)
    .is('stop_time', null);

  if (!sessions?.length) return [];

  const txIds = sessions.map((s) => s.transaction_id).filter(Boolean);
  if (!txIds.length) return [];

  const { data: mvRows } = await supabase
    .from('meter_values')
    .select('transaction_id, measurand, value, unit')
    .in('transaction_id', txIds)
    .in('measurand', ['Power.Active.Import', 'Temperature', 'DC.Temperature', 'CableTemp', 'ConnectorTemp'])
    .order('timestamp', { ascending: false })
    .limit(txIds.length * 4 + 10);

  return buildConnectorList(sessions, mvRows);
}

async function getConnectorLiveDataBatch(chargerIds) {
  if (!chargerIds?.length) return {};

  const { data: sessions } = await supabase
    .from('sessions')
    .select('charger_id, connector_id, transaction_id')
    .in('charger_id', chargerIds)
    .is('stop_time', null);

  const allSessions = sessions || [];
  const txIds = allSessions.map((s) => s.transaction_id).filter(Boolean);

  let mvRows = [];
  if (txIds.length > 0) {
    const { data } = await supabase
      .from('meter_values')
      .select('transaction_id, measurand, value, unit')
      .in('transaction_id', txIds)
      .in('measurand', ['Power.Active.Import', 'Temperature', 'DC.Temperature', 'CableTemp', 'ConnectorTemp'])
      .order('timestamp', { ascending: false })
      .limit(txIds.length * 4 + 20);
    mvRows = data || [];
  }

  const sessionsByCharger = {};
  for (const s of allSessions) {
    if (!sessionsByCharger[s.charger_id]) sessionsByCharger[s.charger_id] = [];
    sessionsByCharger[s.charger_id].push(s);
  }

  const result = {};
  for (const chargerId of chargerIds) {
    result[chargerId] = buildConnectorList(sessionsByCharger[chargerId] || [], mvRows);
  }
  return result;
}

module.exports = { getConnectorLiveData, getConnectorLiveDataBatch };
