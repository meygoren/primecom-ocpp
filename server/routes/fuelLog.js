const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// ── Settings helpers ──────────────────────────────────────────────────────────
async function getSettings() {
  const { data } = await supabase
    .from('fuel_log_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  return data || {
    id: 1,
    monthly_report_enabled: false,
    report_emails: [],
    warehouse_address: '320 E Harry Bridges Blvd, Wilmington, CA 90744',
    customer_address: '11222 S La Cienega Blvd, Inglewood, CA 90304',
    route_distance_miles: 12.4,
    energy_per_mile_kwh: 2.5,
  };
}

// ── Compute energy + efficiency for a trip ────────────────────────────────────
async function computeTripMetrics(body, settings) {
  const distance = body.distance_miles != null ? Number(body.distance_miles) : Number(settings.route_distance_miles || 12.4);

  let energy = body.energy_used_kwh != null ? Number(body.energy_used_kwh) : null;

  // Prefer SOC-based calculation when both SOC values + capacity are available
  if (energy == null && body.start_soc_pct != null && body.end_soc_pct != null && body.vehicle_id) {
    const { data: vehicle } = await supabase
      .from('fleet_vehicles')
      .select('capacity_kwh')
      .eq('id', body.vehicle_id)
      .maybeSingle();
    const cap = vehicle?.capacity_kwh ? Number(vehicle.capacity_kwh) : null;
    if (cap) {
      energy = ((Number(body.start_soc_pct) - Number(body.end_soc_pct)) / 100) * cap;
    }
  }

  // Fall back to distance * energy-per-mile
  if (energy == null) {
    energy = distance * Number(settings.energy_per_mile_kwh || 2.5);
  }

  energy = Math.round(energy * 100) / 100;
  const efficiency = distance > 0 ? Math.round((energy / distance) * 10000) / 10000 : null;

  return { distance, energy, efficiency };
}

// ── GET /api/fuel-log/vehicles ────────────────────────────────────────────────
router.get('/vehicles', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('fleet_vehicles')
      .select('*')
      .order('unit_id', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fuel-log/vehicles — create (or upsert by unit_id) ───────────────
router.post('/vehicles', async (req, res) => {
  try {
    const allowed = ['unit_id', 'type', 'capacity_kwh', 'make', 'model', 'year', 'plate', 'vin', 'notes', 'active'];
    const payload = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    }
    if (!payload.unit_id) return res.status(400).json({ error: 'unit_id is required.' });

    const { data, error } = await supabase
      .from('fleet_vehicles')
      .upsert(payload, { onConflict: 'unit_id' })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/fuel-log/vehicles/:id ──────────────────────────────────────────
router.patch('/vehicles/:id', async (req, res) => {
  try {
    const allowed = ['unit_id', 'type', 'capacity_kwh', 'make', 'model', 'year', 'plate', 'vin', 'notes', 'active'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const { data, error } = await supabase
      .from('fleet_vehicles')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fuel-log/trips ───────────────────────────────────────────────────
router.get('/trips', async (req, res) => {
  try {
    const { limit = 100, vehicle_id, from, to } = req.query;

    let q = supabase
      .from('trip_logs')
      .select('*, fleet_vehicles(unit_id, type)')
      .order('trip_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (vehicle_id) q = q.eq('vehicle_id', vehicle_id);
    if (from)       q = q.gte('trip_date', from);
    if (to)         q = q.lte('trip_date', to);

    const { data, error } = await q;
    if (error) throw error;

    // Flatten unit_id for convenience
    const rows = (data || []).map((r) => ({
      ...r,
      unit_id: r.fleet_vehicles?.unit_id || null,
      vehicle_type: r.fleet_vehicles?.type || null,
    }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fuel-log/trips — log a trip ─────────────────────────────────────
router.post('/trips', async (req, res) => {
  try {
    const { vehicle_id, driver_name, trip_date, direction, notes } = req.body;
    if (!trip_date) return res.status(400).json({ error: 'trip_date is required.' });
    if (!['outbound', 'return'].includes(direction)) return res.status(400).json({ error: 'Invalid direction.' });

    const settings = await getSettings();
    const { distance, energy, efficiency } = await computeTripMetrics(req.body, settings);

    const payload = {
      vehicle_id:   vehicle_id || null,
      driver_name:  driver_name || null,
      trip_date,
      direction,
      origin:       req.body.origin || (direction === 'outbound' ? settings.warehouse_address : settings.customer_address),
      destination:  req.body.destination || (direction === 'outbound' ? settings.customer_address : settings.warehouse_address),
      distance_miles: distance,
      start_soc_pct: req.body.start_soc_pct != null ? Number(req.body.start_soc_pct) : null,
      end_soc_pct:   req.body.end_soc_pct != null ? Number(req.body.end_soc_pct) : null,
      energy_used_kwh: energy,
      efficiency_kwh_per_mile: efficiency,
      notes: notes || null,
    };

    const { data, error } = await supabase
      .from('trip_logs')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[FuelLog] Create trip error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/fuel-log/trips/:id ────────────────────────────────────────────
router.delete('/trips/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('trip_logs').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fuel-log/stats — aggregate for current month ─────────────────────
router.get('/stats', async (_req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('trip_logs')
      .select('distance_miles, energy_used_kwh, efficiency_kwh_per_mile')
      .gte('trip_date', monthStart);
    if (error) throw error;

    const rows = data || [];
    const totalTrips = rows.length;
    const totalMiles = rows.reduce((s, r) => s + (Number(r.distance_miles) || 0), 0);
    const totalEnergy = rows.reduce((s, r) => s + (Number(r.energy_used_kwh) || 0), 0);
    const effRows = rows.filter((r) => r.efficiency_kwh_per_mile != null);
    const avgEfficiency = effRows.length
      ? effRows.reduce((s, r) => s + Number(r.efficiency_kwh_per_mile), 0) / effRows.length
      : 0;

    res.json({
      total_trips: totalTrips,
      total_miles: Math.round(totalMiles * 10) / 10,
      total_energy_kwh: Math.round(totalEnergy * 10) / 10,
      avg_efficiency_kwh_per_mile: Math.round(avgEfficiency * 1000) / 1000,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fuel-log/settings ────────────────────────────────────────────────
router.get('/settings', async (_req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/fuel-log/settings ──────────────────────────────────────────────
router.patch('/settings', async (req, res) => {
  try {
    const allowed = ['monthly_report_enabled', 'report_emails', 'warehouse_address', 'customer_address', 'route_distance_miles', 'energy_per_mile_kwh'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const { data, error } = await supabase
      .from('fuel_log_settings')
      .upsert({ id: 1, ...updates })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
