const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// GET /api/truck-map/trucks
// Returns all 6 charge_trucks with their latest GPS location, SoC, and charger status.
router.get('/trucks', async (req, res) => {
  const { data: trucks, error } = await supabase
    .from('charge_trucks')
    .select('*')
    .order('truck_number', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Collect every OCPP ID used across all trucks
  const allOcppIds = [];
  for (const t of (trucks || [])) {
    for (const field of ['p_ocpp_1', 'p_ocpp_2', 'd_ocpp_1', 'd_ocpp_2']) {
      if (t[field]) allOcppIds.push(t[field]);
    }
  }

  // Fetch latest location, SoC, and charger status in parallel
  const [locResult, socResult, chargerResult] = allOcppIds.length > 0
    ? await Promise.all([
        supabase
          .from('truck_locations')
          .select('charger_id, lat, lng, speed_mph, heading, accuracy_m, recorded_at')
          .in('charger_id', allOcppIds)
          .order('recorded_at', { ascending: false })
          .limit(allOcppIds.length * 5),
        supabase
          .from('meter_values')
          .select('charger_id, value, timestamp')
          .in('charger_id', allOcppIds)
          .eq('measurand', 'SoC')
          .order('timestamp', { ascending: false })
          .limit(allOcppIds.length * 3),
        supabase
          .from('chargers')
          .select('charger_id, status, last_heartbeat, firmware_version')
          .in('charger_id', allOcppIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  // Build lookup maps: latest value per charger_id
  const locationMap = {};
  for (const loc of (locResult.data || [])) {
    if (!locationMap[loc.charger_id]) locationMap[loc.charger_id] = loc;
  }
  const socMap = {};
  for (const s of (socResult.data || [])) {
    if (!socMap[s.charger_id]) socMap[s.charger_id] = parseFloat(s.value);
  }
  const chargerMap = {};
  for (const c of (chargerResult.data || [])) {
    chargerMap[c.charger_id] = c;
  }

  const result = (trucks || []).map((truck) => {
    const ocppIds = [truck.p_ocpp_1, truck.p_ocpp_2, truck.d_ocpp_1, truck.d_ocpp_2].filter(Boolean);

    // Most recent GPS fix across all chargers on this truck
    let bestLoc = null;
    for (const id of ocppIds) {
      const loc = locationMap[id];
      if (!loc) continue;
      if (!bestLoc || new Date(loc.recorded_at) > new Date(bestLoc.recorded_at)) {
        bestLoc = { ...loc };
      }
    }

    const pId = truck.p_ocpp_1 || truck.p_ocpp_2 || null;
    const dId = truck.d_ocpp_1 || truck.d_ocpp_2 || null;

    return {
      id: truck.id,
      truck_number: truck.truck_number,
      label: truck.label || `TRUCK ${truck.truck_number}`,
      notes: truck.notes,
      soc_alert_threshold: truck.soc_alert_threshold,
      location: bestLoc,
      passenger: pId ? {
        charger_id: pId,
        soc: socMap[pId] ?? null,
        status: chargerMap[pId]?.status || 'offline',
        last_heartbeat: chargerMap[pId]?.last_heartbeat || null,
        firmware_version: chargerMap[pId]?.firmware_version || null,
      } : null,
      driver: dId ? {
        charger_id: dId,
        soc: socMap[dId] ?? null,
        status: chargerMap[dId]?.status || 'offline',
        last_heartbeat: chargerMap[dId]?.last_heartbeat || null,
        firmware_version: chargerMap[dId]?.firmware_version || null,
      } : null,
    };
  });

  res.json(result);
});

// POST /api/truck-map/location — manual location update (for testing / admin override)
router.post('/location', async (req, res) => {
  const { charger_id, lat, lng, speed_mph, heading } = req.body;
  if (!charger_id || lat == null || lng == null) {
    return res.status(400).json({ error: 'charger_id, lat, and lng are required' });
  }

  const { data, error } = await supabase
    .from('truck_locations')
    .insert({
      charger_id,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      speed_mph: speed_mph != null ? parseFloat(speed_mph) : null,
      heading: heading != null ? parseFloat(heading) : null,
      recorded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

module.exports = router;
