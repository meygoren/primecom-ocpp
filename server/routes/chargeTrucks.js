const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// Helper: fetch live OCPP data for a given charger ID
async function getLiveData(ocppId) {
  if (!ocppId) return null;

  const [socResult, chargerResult, sessionsResult] = await Promise.all([
    // Latest SoC reading
    supabase
      .from('meter_values')
      .select('value, unit, timestamp')
      .eq('charger_id', ocppId)
      .eq('measurand', 'SoC')
      .order('timestamp', { ascending: false })
      .limit(1),

    // Charger status
    supabase
      .from('chargers')
      .select('status, last_heartbeat')
      .eq('charger_id', ocppId)
      .single(),

    // Active sessions (no stop_time)
    supabase
      .from('sessions')
      .select('*')
      .eq('charger_id', ocppId)
      .is('stop_time', null),
  ]);

  const last_soc = socResult.data?.[0]?.value ?? null;
  const last_soc_time = socResult.data?.[0]?.timestamp ?? null;
  const charger = chargerResult.data || null;
  const activeSessions = sessionsResult.data || [];
  const is_active = activeSessions.length > 0;
  const soc = is_active ? last_soc : null;

  // Get power per active session (transaction-based for accuracy)
  let power_kw = null;
  let session_kwh_charged = null;
  const txIds = activeSessions.map((s) => s.transaction_id).filter(Boolean);
  if (txIds.length > 0) {
    const { data: powerRows } = await supabase
      .from('meter_values')
      .select('value, unit, transaction_id')
      .in('transaction_id', txIds)
      .eq('charger_id', ocppId)
      .eq('measurand', 'Power.Active.Import')
      .order('timestamp', { ascending: false })
      .limit(txIds.length * 2 + 5);

    const seen = new Set();
    let total = 0;
    for (const row of (powerRows || [])) {
      if (!seen.has(row.transaction_id)) {
        seen.add(row.transaction_id);
        const val = parseFloat(row.value);
        total += row.unit === 'W' ? val / 1000 : val;
      }
    }
    if (seen.size > 0) power_kw = total;
  }

  // Energy charged this session — filter by timestamp >= session start_time.
  // This is more reliable than filtering by transaction_id because some chargers
  // send MeterValues without a transactionId, or the accumulated register carries
  // values from prior sessions under the same transaction_id.
  if (is_active && activeSessions.length > 0) {
    const earliestStart = activeSessions
      .map((s) => s.start_time)
      .filter(Boolean)
      .sort()[0];

    if (earliestStart) {
      const { data: energyRows } = await supabase
        .from('meter_values')
        .select('value, unit, timestamp')
        .eq('charger_id', ocppId)
        .eq('measurand', 'Energy.Active.Import.Register')
        .gte('timestamp', earliestStart)
        .order('timestamp', { ascending: true });

      const toKwh = (row) => {
        const v = parseFloat(row.value);
        return row.unit === 'Wh' ? v / 1000 : v;
      };

      if (energyRows && energyRows.length >= 2) {
        const delta = toKwh(energyRows[energyRows.length - 1]) - toKwh(energyRows[0]);
        // Cap at pack capacity as sanity check
        session_kwh_charged = Math.max(0, Math.min(450, delta));
      } else if (energyRows && energyRows.length === 1) {
        session_kwh_charged = 0; // session just started, no delta yet
      }
    }
  }

  // Fall back to latest aggregate reading if no transaction-based data
  if (power_kw === null) {
    const { data: powerRows } = await supabase
      .from('meter_values')
      .select('value, unit')
      .eq('charger_id', ocppId)
      .eq('measurand', 'Power.Active.Import')
      .order('timestamp', { ascending: false })
      .limit(1);
    const powerRaw = powerRows?.[0];
    if (powerRaw) {
      const val = parseFloat(powerRaw.value);
      power_kw = powerRaw.unit === 'W' ? val / 1000 : val;
    }
  }

  // Build connector array from active sessions
  const connectors = [
    {
      connector_id: 1,
      cable: 'A',
      active: activeSessions.some((s) => s.connector_id === 1),
      session: activeSessions.find((s) => s.connector_id === 1) || null,
    },
    {
      connector_id: 2,
      cable: 'B',
      active: activeSessions.some((s) => s.connector_id === 2),
      session: activeSessions.find((s) => s.connector_id === 2) || null,
    },
  ];

  // ETA is computed client-side using known 450 kWh pack capacity and live kW.
  // The server predictor was removed because its historical-blended estimates
  // produced wrong results when session data was sparse or the counter reset.

  return {
    ocpp_id: ocppId,
    soc,
    last_soc,
    last_soc_time,
    is_active,
    session_kwh_charged,
    power_kw,
    status: charger?.status || 'offline',
    last_heartbeat: charger?.last_heartbeat || null,
    connectors,
  };
}

// GET /api/charge-trucks/warehouse — fetch warehouse chargers with live data
// IMPORTANT: defined BEFORE /:id to avoid route shadowing
router.get('/warehouse', async (req, res) => {
  const { data, error } = await supabase
    .from('ef_warehouse_chargers')
    .select('*')
    .order('slot', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const results = await Promise.all(
    (data || []).map(async (wc) => ({
      ...wc,
      live: await getLiveData(wc.ocpp_id),
    }))
  );

  res.json(results);
});

// PATCH /api/charge-trucks/warehouse/:id — update warehouse charger fields
router.patch('/warehouse/:id', async (req, res) => {
  const { id } = req.params;
  const { label, ocpp_id, current_truck_label } = req.body;

  const updates = {};
  if (label !== undefined) updates.label = label;
  if (ocpp_id !== undefined) updates.ocpp_id = ocpp_id;
  if (current_truck_label !== undefined) updates.current_truck_label = current_truck_label;

  const { data, error } = await supabase
    .from('ef_warehouse_chargers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/charge-trucks/warehouse/bay/:bay/truck — assign a truck label to an entire bay
// bay = 'A' or 'B'; slots 1-2 = Bay A, slots 3-4 = Bay B
router.patch('/warehouse/bay/:bay/truck', async (req, res) => {
  const { bay } = req.params;
  const { current_truck_label } = req.body;

  const slotFilter = bay === 'A' ? [1, 2] : [3, 4];

  const { data, error } = await supabase
    .from('ef_warehouse_chargers')
    .update({ current_truck_label: current_truck_label || null })
    .in('slot', slotFilter)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, updated: data });
});

// GET /api/charge-trucks/truck-profiles — list all truck profiles
router.get('/truck-profiles', async (req, res) => {
  const { data, error } = await supabase
    .from('ef_truck_profiles')
    .select('*')
    .order('truck_number', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/charge-trucks/truck-profiles — upsert a truck profile by truck_number
router.post('/truck-profiles', async (req, res) => {
  const { truck_number, label, passenger_mac, driver_mac } = req.body;
  if (!truck_number || truck_number < 1 || truck_number > 6) {
    return res.status(400).json({ error: 'truck_number must be 1-6' });
  }

  const { data: existing } = await supabase
    .from('ef_truck_profiles')
    .select('id')
    .eq('truck_number', truck_number)
    .single();

  const updates = { truck_number, label: label || null, passenger_mac: passenger_mac || null, driver_mac: driver_mac || null };

  let result;
  if (existing) {
    result = await supabase.from('ef_truck_profiles').update(updates).eq('truck_number', truck_number).select().single();
  } else {
    result = await supabase.from('ef_truck_profiles').insert(updates).select().single();
  }

  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json(result.data);
});

// GET /api/charge-trucks — list all trucks with live data
router.get('/', async (req, res) => {
  const { data: trucks, error } = await supabase
    .from('charge_trucks')
    .select('*')
    .order('truck_number', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const results = await Promise.all(
    (trucks || []).map(async (truck) => {
      const [p1, p2, d1, d2] = await Promise.all([
        getLiveData(truck.p_ocpp_1),
        getLiveData(truck.p_ocpp_2),
        getLiveData(truck.d_ocpp_1),
        getLiveData(truck.d_ocpp_2),
      ]);

      return {
        ...truck,
        live: {
          passenger: { unit_1: p1, unit_2: p2 },
          driver: { unit_1: d1, unit_2: d2 },
        },
      };
    })
  );

  res.json(results);
});

// PATCH /api/charge-trucks/:id — update truck fields
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { label, p_ocpp_1, p_ocpp_2, d_ocpp_1, d_ocpp_2, soc_alert_threshold, notes } = req.body;

  const updates = {};
  if (label !== undefined) updates.label = label;
  if (p_ocpp_1 !== undefined) updates.p_ocpp_1 = p_ocpp_1;
  if (p_ocpp_2 !== undefined) updates.p_ocpp_2 = p_ocpp_2;
  if (d_ocpp_1 !== undefined) updates.d_ocpp_1 = d_ocpp_1;
  if (d_ocpp_2 !== undefined) updates.d_ocpp_2 = d_ocpp_2;
  if (soc_alert_threshold !== undefined) updates.soc_alert_threshold = soc_alert_threshold;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase
    .from('charge_trucks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
