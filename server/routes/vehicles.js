const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// Helper: aggregate session stats per id_tag
async function getSessionStats() {
  const { data } = await supabase
    .from('sessions')
    .select('id_tag, charger_id, energy_kwh, start_time, stop_time')
    .not('id_tag', 'is', null)
    .not('id_tag', 'eq', '');

  const map = {};
  for (const s of (data || [])) {
    const key = (s.id_tag || '').trim();
    if (!key) continue;
    if (!map[key]) {
      map[key] = { id_tag: key, total_sessions: 0, total_kwh: 0, last_charged: null, chargers: new Set() };
    }
    map[key].total_sessions += 1;
    map[key].total_kwh += parseFloat(s.energy_kwh || 0);
    map[key].chargers.add(s.charger_id);
    if (!map[key].last_charged || s.start_time > map[key].last_charged) {
      map[key].last_charged = s.start_time;
    }
  }
  // Flatten sets
  for (const k of Object.keys(map)) {
    map[k].chargers = [...map[k].chargers];
    map[k].total_kwh = Math.round(map[k].total_kwh * 10) / 10;
  }
  return map;
}

// GET /api/vehicles — list all profiles + unregistered MACs from sessions
router.get('/', async (req, res) => {
  const [profilesResult, statsMap] = await Promise.all([
    supabase.from('vehicle_profiles').select('*').order('created_at', { ascending: false }),
    getSessionStats(),
  ]);

  if (profilesResult.error) return res.status(500).json({ error: profilesResult.error.message });

  const profiles = (profilesResult.data || []).map((p) => {
    const stats = statsMap[p.mac_address] || {};
    return {
      ...p,
      total_sessions: stats.total_sessions || 0,
      total_kwh: stats.total_kwh || 0,
      last_charged: stats.last_charged || null,
      chargers: stats.chargers || [],
    };
  });

  // Find id_tags in sessions not yet in any profile
  const registeredMacs = new Set(profiles.map((p) => p.mac_address));
  const unregistered = Object.values(statsMap)
    .filter((s) => !registeredMacs.has(s.id_tag))
    .sort((a, b) => (b.last_charged || '') - (a.last_charged || ''));

  res.json({ profiles, unregistered });
});

// GET /api/vehicles/export — CSV of all vehicles with aggregated stats
router.get('/export', async (req, res) => {
  const [profilesResult, statsMap] = await Promise.all([
    supabase.from('vehicle_profiles').select('*'),
    getSessionStats(),
  ]);

  const profiles = (profilesResult.data || []).map((p) => ({
    ...p,
    ...(statsMap[p.mac_address] || { total_sessions: 0, total_kwh: 0, last_charged: null }),
  }));

  function esc(v) {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  const cols = ['license_plate', 'vin', 'make', 'model', 'year', 'mac_address', 'total_sessions', 'total_kwh', 'last_charged', 'notes'];
  const header = cols.join(',');
  const rows = profiles.map((p) => cols.map((c) => esc(p[c])).join(','));
  const csv = [header, ...rows].join('\r\n');

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="vehicles-${date}.csv"`);
  res.send(csv);
});

// Helper: enrich sessions with location_label from chargers table
async function enrichWithLocation(sessions) {
  const chargerIds = [...new Set((sessions || []).map((s) => s.charger_id).filter(Boolean))];
  if (chargerIds.length === 0) return sessions || [];
  const { data: chargers } = await supabase
    .from('chargers')
    .select('charger_id, location_label')
    .in('charger_id', chargerIds);
  const locMap = {};
  for (const c of (chargers || [])) locMap[c.charger_id] = c.location_label || null;
  return (sessions || []).map((s) => ({ ...s, location_label: locMap[s.charger_id] || null }));
}

// GET /api/vehicles/:id/sessions — all sessions for a vehicle profile
router.get('/:id/sessions', async (req, res) => {
  const { data: profile, error: pe } = await supabase
    .from('vehicle_profiles')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (pe) return res.status(404).json({ error: 'Vehicle not found' });

  const { data: sessions, error: se } = await supabase
    .from('sessions')
    .select('*')
    .eq('id_tag', profile.mac_address)
    .order('start_time', { ascending: false })
    .limit(500);

  if (se) return res.status(500).json({ error: se.message });
  const enriched = await enrichWithLocation(sessions);
  res.json({ profile, sessions: enriched });
});

// GET /api/vehicles/mac/:mac/sessions — sessions by raw MAC (for unregistered)
router.get('/mac/:mac/sessions', async (req, res) => {
  const mac = decodeURIComponent(req.params.mac);
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id_tag', mac)
    .order('start_time', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  const enriched = await enrichWithLocation(sessions);
  res.json({ sessions: enriched });
});

// POST /api/vehicles — create a vehicle profile
router.post('/', async (req, res) => {
  const { mac_address, vin, license_plate, make, model, year, notes } = req.body;
  if (!mac_address) return res.status(400).json({ error: 'mac_address is required' });

  const { data, error } = await supabase
    .from('vehicle_profiles')
    .insert({ mac_address: mac_address.trim(), vin: vin || null, license_plate: license_plate || null, make: make || null, model: model || null, year: year || null, notes: notes || null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/vehicles/:id — update a vehicle profile
router.patch('/:id', async (req, res) => {
  const { vin, license_plate, make, model, year, notes, mac_address } = req.body;
  const updates = {};
  if (mac_address !== undefined) updates.mac_address = mac_address;
  if (vin !== undefined) updates.vin = vin;
  if (license_plate !== undefined) updates.license_plate = license_plate;
  if (make !== undefined) updates.make = make;
  if (model !== undefined) updates.model = model;
  if (year !== undefined) updates.year = year;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase
    .from('vehicle_profiles')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/vehicles/:id — remove a vehicle profile (keeps sessions)
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('vehicle_profiles')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
