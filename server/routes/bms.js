const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const requireRole = require('../middleware/requireRole');
const { extractBmsLog, analyzeBmsLog, mergeSettings, DEFAULT_SETTINGS } = require('../services/bmsAnalyzer');

// BMS Reports: upload a Primecom battery BMS log (.xlsx export from the
// online BMS platform) and get a hard-coded analysis back — energy in/out,
// power, current vs the 990 A limit, temperatures, cell balance, insulation,
// faults and warnings. See services/bmsAnalyzer.js for the analysis itself.

const anyRole = requireRole('admin', 'operator', 'viewer');
const operatorUp = requireRole('admin', 'operator');
const adminOnly = requireRole('admin');

const MIGRATION_HINT = 'run supabase_migration_bms.sql in the Supabase SQL editor';
const LIST_COLUMNS = 'id, created_at, uploaded_by, file_name, hwid, label, vehicle, notes, project_name, device_model, start_time, end_time, row_count, summary';

async function loadSettings() {
  const { data, error } = await supabase.from('bms_settings').select('settings').eq('id', 1).maybeSingle();
  if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
  return mergeSettings(data?.settings);
}

function toExtracted(row) {
  return { meta: row.meta || {}, data: row.data, cell_stats: row.cell_stats || [], temp_stats: row.temp_stats || [] };
}

// GET /api/bms/settings
router.get('/settings', anyRole, async (_req, res) => {
  try {
    res.json({ settings: await loadSettings(), defaults: DEFAULT_SETTINGS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bms/settings — body: { settings: { sections, limits, thresholds, events } }
router.put('/settings', operatorUp, async (req, res) => {
  const settings = mergeSettings(req.body?.settings);
  const { error } = await supabase
    .from('bms_settings')
    .upsert({ id: 1, settings, updated_at: new Date().toISOString() });
  if (error) return res.status(500).json({ error: `${error.message} — ${MIGRATION_HINT}` });
  res.json({ settings });
});

// GET /api/bms/reports — list, newest log first
router.get('/reports', anyRole, async (_req, res) => {
  const { data, error } = await supabase
    .from('bms_reports')
    .select(LIST_COLUMNS)
    .order('start_time', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: `${error.message} — ${MIGRATION_HINT}` });
  res.json(data);
});

// POST /api/bms/reports — upload one .xlsx file as the raw request body.
// Headers: Content-Type: application/octet-stream, X-File-Name: original name
router.post(
  '/reports',
  operatorUp,
  express.raw({ type: () => true, limit: '300mb' }),
  async (req, res) => {
    const fileName = decodeURIComponent(req.get('x-file-name') || 'bms-log.xlsx');
    if (!Buffer.isBuffer(req.body) || req.body.length < 100) {
      return res.status(400).json({ error: 'No file received' });
    }

    let extracted;
    try {
      extracted = await extractBmsLog(req.body);
    } catch (err) {
      console.error(`[BMS] Could not read ${fileName}:`, err.message);
      return res.status(400).json({ error: `Could not read ${fileName}: ${err.message}` });
    }

    try {
      const settings = await loadSettings();
      const analysis = analyzeBmsLog(extracted, settings);
      const { meta, summary } = analysis;
      const startIso = new Date(summary.start).toISOString();
      const endIso = new Date(summary.end).toISOString();

      // Same battery + same time window + same length = already uploaded.
      const { data: dupe } = await supabase
        .from('bms_reports')
        .select('id')
        .eq('hwid', meta.hwid)
        .eq('start_time', startIso)
        .eq('end_time', endIso)
        .eq('row_count', summary.samples)
        .maybeSingle();
      if (dupe) return res.json({ id: dupe.id, duplicate: true });

      // Carry the battery's name and vehicle over from its previous report.
      const { data: prev } = await supabase
        .from('bms_reports')
        .select('label, vehicle')
        .eq('hwid', meta.hwid)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data, error } = await supabase
        .from('bms_reports')
        .insert({
          uploaded_by: req.user?.email || null,
          file_name: fileName,
          hwid: meta.hwid,
          label: prev?.label || null,
          vehicle: prev?.vehicle || settings.limits.vehicle_name || null,
          project_name: meta.project_name,
          device_model: meta.device_model,
          software_version: meta.software_version,
          start_time: startIso,
          end_time: endIso,
          row_count: summary.samples,
          meta: extracted.meta,
          data: extracted.data,
          cell_stats: extracted.cell_stats,
          temp_stats: extracted.temp_stats,
          summary,
        })
        .select('id')
        .single();
      if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);

      console.log(`[BMS] Uploaded ${fileName}: ${summary.samples} samples, ${summary.warnings.warning} warnings`);
      res.json({ id: data.id, duplicate: false });
    } catch (err) {
      console.error(`[BMS] Upload failed for ${fileName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/bms/reports/:id — full analysis, re-run with the current settings,
// plus the previous report for the same battery for comparison.
router.get('/reports/:id', anyRole, async (req, res) => {
  const { data: row, error } = await supabase.from('bms_reports').select('*').eq('id', req.params.id).single();
  if (error || !row) return res.status(404).json({ error: 'Report not found' });

  try {
    const settings = await loadSettings();
    const analysis = analyzeBmsLog(toExtracted(row), settings);

    // Keep the list view in step with the latest settings / analysis code.
    if (JSON.stringify(row.summary) !== JSON.stringify(analysis.summary)) {
      await supabase.from('bms_reports').update({ summary: analysis.summary }).eq('id', row.id);
    }

    let previous = null;
    if (row.hwid) {
      const { data: prev } = await supabase
        .from('bms_reports')
        .select('id, start_time, end_time, file_name, summary')
        .eq('hwid', row.hwid)
        .lt('start_time', row.start_time)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      previous = prev || null;
    }

    const { data: _d, cell_stats: _c, temp_stats: _t, ...info } = row;
    res.json({ report: { ...info, summary: analysis.summary }, analysis, previous });
  } catch (err) {
    console.error('[BMS] Analysis failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/bms/reports/:id — body: { label?, vehicle?, notes? }
router.patch('/reports/:id', operatorUp, async (req, res) => {
  const updates = {};
  for (const k of ['label', 'vehicle', 'notes']) {
    if (req.body[k] !== undefined) updates[k] = req.body[k] ? String(req.body[k]).trim() : null;
  }
  const { data, error } = await supabase.from('bms_reports').update(updates).eq('id', req.params.id).select(LIST_COLUMNS).single();
  if (error) return res.status(500).json({ error: error.message });

  // A battery name applies to every report from that battery.
  if (updates.label !== undefined && data.hwid) {
    await supabase.from('bms_reports').update({ label: updates.label }).eq('hwid', data.hwid);
  }
  res.json(data);
});

// DELETE /api/bms/reports/:id
router.delete('/reports/:id', adminOnly, async (req, res) => {
  const { error } = await supabase.from('bms_reports').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
