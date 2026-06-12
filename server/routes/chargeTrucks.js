const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { predictTimeToFull } = require('../services/socPredictor');

// Helper: fetch live OCPP data for a given charger ID
async function getLiveData(ocppId) {
  if (!ocppId) return null;

  const [socResult, powerResult, chargerResult, sessionsResult] = await Promise.all([
    // Latest SoC reading
    supabase
      .from('meter_values')
      .select('value, unit, timestamp')
      .eq('charger_id', ocppId)
      .eq('measurand', 'SoC')
      .order('timestamp', { ascending: false })
      .limit(1),

    // Latest power reading
    supabase
      .from('meter_values')
      .select('value, unit, timestamp')
      .eq('charger_id', ocppId)
      .eq('measurand', 'Power.Active.Import')
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

  const soc = socResult.data?.[0]?.value ?? null;
  const powerRaw = powerResult.data?.[0];
  let power_kw = null;
  if (powerRaw) {
    const val = parseFloat(powerRaw.value);
    power_kw = powerRaw.unit === 'W' ? val / 1000 : val;
  }

  const charger = chargerResult.data || null;
  const activeSessions = sessionsResult.data || [];

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

  // Predict time to 100% when actively charging with a known SOC
  let eta = null;
  const isCharging = charger?.status === 'charging' || activeSessions.length > 0;
  if (isCharging && soc !== null && soc < 100) {
    try {
      eta = await predictTimeToFull(ocppId, parseFloat(soc), power_kw);
    } catch (err) {
      console.error(`[Predictor] Error for ${ocppId}:`, err.message);
    }
  }

  return {
    ocpp_id: ocppId,
    soc,
    power_kw,
    status: charger?.status || 'offline',
    last_heartbeat: charger?.last_heartbeat || null,
    connectors,
    eta_minutes: eta?.minutes ?? null,
    eta_confidence: eta?.confidence ?? null,
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
  const { label, ocpp_id } = req.body;

  const updates = {};
  if (label !== undefined) updates.label = label;
  if (ocpp_id !== undefined) updates.ocpp_id = ocpp_id;

  const { data, error } = await supabase
    .from('ef_warehouse_chargers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
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
