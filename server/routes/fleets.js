const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const connections = require('../state/connections');
const requireRole = require('../middleware/requireRole');
const {
  POWER, ENERGY, SOC,
  normalizeMac, looksLikeMac, getBatterySystems, inferBatterySystem,
  summarizeSamples, energyFromMeters, fetchTransactionSamples, finalizeSession,
} = require('../services/sessionStats');

// Locations / clients ("Fleet" dropdown in the sidebar).
// A location owns a set of chargers (chargers.fleet_id), chooses which
// sidebar tabs are shown while it is selected, and — when its dashboard is
// 'location' — gets the energy dashboard: live kW feed, session summaries,
// daily kWh and battery system breakdown.

const anyRole = requireRole('admin', 'operator', 'viewer');
const operatorUp = requireRole('admin', 'operator');
const adminOnly = requireRole('admin');

const DASHBOARD_TYPES = ['standard', 'location'];
const SESSION_LIST_LIMIT = 2000;

function slugify(label) {
  return String(label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function pickFleetFields(body) {
  const out = {};
  if (body.label !== undefined) out.label = String(body.label).trim();
  if (body.city !== undefined) out.city = body.city ? String(body.city).trim() : null;
  if (body.color !== undefined) out.color = body.color || '#47a141';
  if (body.dashboard !== undefined) {
    if (!DASHBOARD_TYPES.includes(body.dashboard)) throw new Error(`dashboard must be one of: ${DASHBOARD_TYPES.join(', ')}`);
    out.dashboard = body.dashboard;
  }
  if (body.nav_tabs !== undefined) {
    // null = show every tab
    out.nav_tabs = Array.isArray(body.nav_tabs) ? body.nav_tabs.map(String) : null;
  }
  if (body.sort_order !== undefined) out.sort_order = parseInt(body.sort_order) || 0;
  return out;
}

async function getFleetChargerIds(fleetId) {
  const { data, error } = await supabase.from('chargers').select('charger_id').eq('fleet_id', fleetId);
  if (error) throw new Error(error.message);
  return (data || []).map((c) => c.charger_id);
}

// GET /api/fleets — every location with its charger count
router.get('/', anyRole, async (_req, res) => {
  const { data: fleets, error } = await supabase.from('fleets').select('*').order('sort_order').order('label');
  if (error) {
    return res.status(500).json({
      error: `${error.message} — run supabase_migration_locations.sql in the Supabase SQL editor`,
    });
  }

  const { data: chargers } = await supabase.from('chargers').select('fleet_id').not('fleet_id', 'is', null);
  const counts = {};
  for (const c of chargers || []) counts[c.fleet_id] = (counts[c.fleet_id] || 0) + 1;

  res.json(fleets.map((f) => ({ ...f, charger_count: counts[f.id] || 0 })));
});

// POST /api/fleets — create a location
router.post('/', adminOnly, async (req, res) => {
  let fields;
  try {
    fields = pickFleetFields(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!fields.label) return res.status(400).json({ error: 'Location name is required' });

  const id = slugify(req.body.id || fields.label);
  if (!id) return res.status(400).json({ error: 'Location name must contain letters or numbers' });

  const { data, error } = await supabase
    .from('fleets')
    .insert({ dashboard: 'location', ...fields, id })
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505' ? `A location with id "${id}" already exists` : error.message;
    return res.status(400).json({ error: msg });
  }
  res.json({ ...data, charger_count: 0 });
});

// PATCH /api/fleets/:id — rename, change color, dashboard type, sidebar tabs
router.patch('/:id', adminOnly, async (req, res) => {
  let fields;
  try {
    fields = pickFleetFields(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (fields.label === '') return res.status(400).json({ error: 'Location name cannot be empty' });

  const { data, error } = await supabase.from('fleets').update(fields).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/fleets/:id — remove a location. Its chargers become unassigned
// (their data and sessions are untouched).
router.delete('/:id', adminOnly, async (req, res) => {
  const { id } = req.params;
  await supabase.from('chargers').update({ fleet_id: null }).eq('fleet_id', id);
  const { error } = await supabase.from('fleets').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// PUT /api/fleets/:id/chargers — set exactly which chargers belong here.
// Body: { charger_ids: [...] }. Chargers left out are unassigned from this
// location; chargers listed are moved here from wherever they were.
router.put('/:id/chargers', operatorUp, async (req, res) => {
  const { id } = req.params;
  const ids = Array.isArray(req.body.charger_ids) ? req.body.charger_ids.map(String) : null;
  if (!ids) return res.status(400).json({ error: 'charger_ids must be an array' });

  try {
    const current = await getFleetChargerIds(id);
    const toRemove = current.filter((c) => !ids.includes(c));

    if (toRemove.length) {
      const { error } = await supabase.from('chargers').update({ fleet_id: null }).in('charger_id', toRemove);
      if (error) throw new Error(error.message);
    }
    if (ids.length) {
      const { error } = await supabase.from('chargers').update({ fleet_id: id }).in('charger_id', ids);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true, charger_ids: ids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fleets/:id/live — live feed for the location dashboard.
// Each charger with its active sessions: current kW, energy so far, SoC,
// running peak/low/avg kW, battery system and a recent power curve.
router.get('/:id/live', anyRole, async (req, res) => {
  const { id } = req.params;

  const { data: chargers, error } = await supabase
    .from('chargers')
    .select('*')
    .eq('fleet_id', id)
    .order('charger_id');
  if (error) return res.status(500).json({ error: error.message });

  const ids = (chargers || []).map((c) => c.charger_id);
  let active = [];
  if (ids.length) {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .in('charger_id', ids)
      .is('stop_time', null)
      .order('start_time', { ascending: false });
    active = data || [];
  }

  const systems = await getBatterySystems();
  const LIVE_ROWS = 900;

  const liveSessions = await Promise.all(active.map(async (session) => {
    const { data: rows } = await supabase
      .from('meter_values')
      .select('timestamp, measurand, value, unit')
      .eq('charger_id', session.charger_id)
      .eq('transaction_id', session.transaction_id)
      .in('measurand', [POWER, ENERGY, SOC])
      .gte('timestamp', new Date(new Date(session.start_time).getTime() - 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(LIVE_ROWS);

    const s = summarizeSamples(rows || []);
    const sawWholeSession = (rows || []).length < LIVE_ROWS;

    const meterStart = session.meter_start_wh != null
      ? parseFloat(session.meter_start_wh)
      : (sawWholeSession ? s.firstEnergyWh : null);
    const meterNow = s.lastEnergyWh ?? (session.meter_stop_wh != null ? parseFloat(session.meter_stop_wh) : null);
    const energyKwh = energyFromMeters(meterStart, meterNow, null);

    const startSoc = session.start_soc != null ? parseFloat(session.start_soc) : (sawWholeSession ? s.startSoc : null);
    const currentSoc = s.endSoc ?? (session.end_soc != null ? parseFloat(session.end_soc) : null);

    // Battery system: stored value wins when it came from a definitive source.
    let battery = { system: session.battery_system, source: session.battery_system_source, estCapacity: session.est_capacity_kwh };
    if (!['manual', 'charger', 'mac'].includes(session.battery_system_source)) {
      const charger = chargers.find((c) => c.charger_id === session.charger_id);
      const inferred = inferBatterySystem(
        { chargerSetting: charger?.battery_system, mac: session.battery_mac || session.id_tag, energyKwh, startSoc, endSoc: currentSoc },
        systems
      );
      if (inferred.system) battery = inferred;
    }

    const lastSampleAt = (rows || [])[0]?.timestamp || null;
    // Keep the curve light: at most ~240 points.
    const step = Math.max(1, Math.ceil(s.power.length / 240));
    const curve = s.power.filter((_, i) => i % step === 0 || i === s.power.length - 1)
      .map((p) => ({ t: p.t, kw: Math.round(p.kw * 10) / 10 }));

    return {
      id: session.id,
      charger_id: session.charger_id,
      connector_id: session.connector_id,
      transaction_id: session.transaction_id,
      id_tag: session.id_tag,
      battery_mac: session.battery_mac || (looksLikeMac(session.id_tag) ? normalizeMac(session.id_tag) : null),
      start_time: session.start_time,
      power_kw: s.latestPowerKw,
      energy_kwh: energyKwh,
      start_soc: startSoc,
      soc: currentSoc,
      max_power_kw: session.max_power_kw != null ? parseFloat(session.max_power_kw) : s.maxPowerKw,
      min_power_kw: session.min_power_kw != null ? parseFloat(session.min_power_kw) : s.minPowerKw,
      avg_power_kw: session.avg_power_kw != null ? parseFloat(session.avg_power_kw) : s.avgPowerKw,
      battery_system: battery.system || null,
      battery_system_source: battery.source || null,
      est_capacity_kwh: battery.estCapacity ?? null,
      last_sample_at: lastSampleAt,
      // No meter data for 15 min usually means StopTransaction was lost.
      stale: !lastSampleAt || Date.now() - new Date(lastSampleAt).getTime() > 15 * 60 * 1000,
      curve,
    };
  }));

  const result = (chargers || []).map((c) => ({
    charger_id: c.charger_id,
    location_label: c.location_label,
    status: c.status,
    connected: connections.has(c.charger_id),
    last_heartbeat: c.last_heartbeat,
    model: c.model,
    rated_kw: c.rated_kw,
    battery_system: c.battery_system || 'auto',
    sessions: liveSessions.filter((s) => s.charger_id === c.charger_id),
  }));

  res.json({ chargers: result, battery_systems: systems, server_time: new Date().toISOString() });
});

// GET /api/fleets/:id/sessions?from=ISO&to=ISO — session history + summaries
// for every charger currently assigned to this location.
router.get('/:id/sessions', anyRole, async (req, res) => {
  const { id } = req.params;
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString();
  const to = req.query.to || new Date(Date.now() + 60000).toISOString();

  try {
    const ids = await getFleetChargerIds(id);
    if (!ids.length) return res.json([]);

    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .in('charger_id', ids)
      .gte('start_time', from)
      .lt('start_time', to)
      .order('start_time', { ascending: false })
      .limit(SESSION_LIST_LIMIT);
    if (error) throw new Error(error.message);

    // In-progress sessions have no energy_kwh yet — fill it from the latest
    // meter reading so daily totals include what is charging right now.
    const rows = (data || []).map((s) => {
      if (s.stop_time || s.energy_kwh != null) return s;
      const live = energyFromMeters(s.meter_start_wh, s.meter_stop_wh, null);
      return { ...s, energy_kwh: live != null ? Math.round(live * 1000) / 1000 : null, in_progress: true };
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fleets/:id/sessions/:sessionId/curve — power + SoC over one session
router.get('/:id/sessions/:sessionId/curve', anyRole, async (req, res) => {
  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', req.params.sessionId)
    .single();
  if (error || !session) return res.status(404).json({ error: 'Session not found' });

  const samples = await fetchTransactionSamples(session);
  const s = summarizeSamples(samples);

  // Merge power and SoC on one timeline, downsampled to ~300 points.
  const byT = new Map();
  for (const p of s.power) byT.set(p.t, { t: p.t, kw: Math.round(p.kw * 10) / 10 });
  for (const p of s.soc) byT.set(p.t, { ...(byT.get(p.t) || { t: p.t }), soc: p.v });
  const points = [...byT.values()].sort((a, b) => a.t - b.t);
  const step = Math.max(1, Math.ceil(points.length / 300));

  res.json({
    points: points.filter((_, i) => i % step === 0 || i === points.length - 1),
    sample_count: samples.length,
    note: samples.length === 0 ? 'No meter readings found. Meter data is kept for 60 days.' : null,
  });
});

// PATCH /api/fleets/sessions/:sessionId — manually set the battery system.
// Body: { battery_system: 'primecom' | 'setec' | null }  (null = back to auto)
router.patch('/sessions/:sessionId', operatorUp, async (req, res) => {
  const { sessionId } = req.params;
  const value = req.body.battery_system || null;

  if (value) {
    const systems = await getBatterySystems();
    if (!systems.some((s) => s.id === value)) return res.status(400).json({ error: `Unknown battery system "${value}"` });
    const { data, error } = await supabase
      .from('sessions')
      .update({ battery_system: value, battery_system_source: 'manual', est_capacity_kwh: null })
      .eq('id', sessionId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  // Back to automatic detection: clear the override and recompute.
  const { data: session, error } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
  if (error || !session) return res.status(404).json({ error: 'Session not found' });
  const updated = await finalizeSession({ ...session, battery_system_source: null });
  res.json(updated || session);
});

// POST /api/fleets/:id/recalculate — rebuild summaries for this location's
// finished sessions from stored meter readings (last 60 days, which is how
// long meter_values is kept). Useful after entering battery MAC addresses.
router.post('/:id/recalculate', operatorUp, async (req, res) => {
  try {
    const ids = await getFleetChargerIds(req.params.id);
    if (!ids.length) return res.json({ updated: 0, total: 0 });

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('*')
      .in('charger_id', ids)
      .not('stop_time', 'is', null)
      .gte('start_time', new Date(Date.now() - 60 * 86400000).toISOString())
      .order('start_time', { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    let updated = 0;
    for (const s of sessions || []) {
      const result = await finalizeSession(s);
      if (result) updated++;
    }
    res.json({ updated, total: (sessions || []).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fleets/:id/tags — ID tags / battery MACs seen at this location in
// the last 90 days. Helps identify which MAC belongs to which battery system.
router.get('/:id/tags', anyRole, async (req, res) => {
  try {
    const ids = await getFleetChargerIds(req.params.id);
    if (!ids.length) return res.json([]);

    const { data, error } = await supabase
      .from('sessions')
      .select('id_tag, battery_mac, start_time, energy_kwh, battery_system')
      .in('charger_id', ids)
      .gte('start_time', new Date(Date.now() - 90 * 86400000).toISOString())
      .order('start_time', { ascending: false })
      .limit(SESSION_LIST_LIMIT);
    if (error) throw new Error(error.message);

    const systems = await getBatterySystems();
    const map = new Map();
    for (const s of data || []) {
      const raw = s.battery_mac || s.id_tag;
      if (!raw) continue;
      const key = normalizeMac(raw);
      if (!map.has(key)) {
        const matched = systems.find((sys) => (sys.mac_addresses || []).some((m) => normalizeMac(m) === key));
        map.set(key, {
          tag: key,
          is_mac: looksLikeMac(key),
          sessions: 0,
          total_kwh: 0,
          last_seen: s.start_time,
          matched_system: matched?.id || null,
        });
      }
      const entry = map.get(key);
      entry.sessions += 1;
      entry.total_kwh += parseFloat(s.energy_kwh) || 0;
    }
    res.json([...map.values()].map((e) => ({ ...e, total_kwh: Math.round(e.total_kwh * 10) / 10 })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
