const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

function csvEscape(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function buildDateFilter(query, field, from, to) {
  if (from) query = query.gte(field, from);
  if (to) query = query.lte(field, to);
  return query;
}

function setDownloadHeaders(res, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

// GET /api/export/:chargerId/measurands
// Returns list of distinct measurands stored for this charger in the given date range
router.get('/:chargerId/measurands', async (req, res) => {
  const { chargerId } = req.params;
  const { from, to } = req.query;

  let query = supabase
    .from('meter_values')
    .select('measurand')
    .eq('charger_id', chargerId)
    .limit(10000);

  query = buildDateFilter(query, 'timestamp', from, to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const measurands = [...new Set((data || []).map((r) => r.measurand))].sort();
  res.json({ measurands });
});

// GET /api/export/:chargerId/sessions
router.get('/:chargerId/sessions', async (req, res) => {
  const { chargerId } = req.params;
  const { from, to } = req.query;

  let query = supabase
    .from('sessions')
    .select('*')
    .eq('charger_id', chargerId)
    .order('start_time', { ascending: true })
    .limit(10000);

  query = buildDateFilter(query, 'start_time', from, to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const rows = data || [];
  const headers = ['transaction_id', 'connector_id', 'id_tag', 'start_time', 'stop_time', 'duration_min', 'energy_kwh', 'stop_reason'];

  const csvRows = rows.map((r) => {
    const durationMs = r.stop_time && r.start_time ? new Date(r.stop_time) - new Date(r.start_time) : null;
    return [
      r.transaction_id ?? '',
      r.connector_id ?? '',
      csvEscape(r.id_tag),
      r.start_time ?? '',
      r.stop_time ?? '',
      durationMs != null ? (durationMs / 60000).toFixed(2) : '',
      r.energy_kwh ?? '',
      csvEscape(r.stop_reason),
    ].join(',');
  });

  const date = new Date().toISOString().slice(0, 10);
  setDownloadHeaders(res, `${chargerId}_sessions_${date}.csv`);
  res.send([headers.join(','), ...csvRows].join('\n'));
});

// GET /api/export/:chargerId/meter-values
// Pivoted: each row = one timestamp, columns = measurands
router.get('/:chargerId/meter-values', async (req, res) => {
  const { chargerId } = req.params;
  const { from, to, measurands: measurandsParam } = req.query;

  const selectedMeasurands = measurandsParam
    ? measurandsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  let query = supabase
    .from('meter_values')
    .select('timestamp, transaction_id, measurand, value, unit')
    .eq('charger_id', chargerId)
    .order('timestamp', { ascending: true })
    .limit(100000);

  query = buildDateFilter(query, 'timestamp', from, to);
  if (selectedMeasurands?.length) query = query.in('measurand', selectedMeasurands);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const rows = data || [];

  // Pivot by (timestamp, transaction_id)
  const allMeasurands = selectedMeasurands?.length
    ? selectedMeasurands
    : [...new Set(rows.map((r) => r.measurand))].sort();

  const groups = {};
  const groupOrder = [];

  for (const row of rows) {
    const key = `${row.timestamp}|${row.transaction_id ?? ''}`;
    if (!groups[key]) {
      groups[key] = { timestamp: row.timestamp, transaction_id: row.transaction_id ?? '' };
      groupOrder.push(key);
    }
    groups[key][row.measurand] = row.value;
  }

  const headers = ['timestamp', 'transaction_id', ...allMeasurands];
  const csvRows = groupOrder.map((key) => {
    const g = groups[key];
    return headers.map((h) => (g[h] != null ? g[h] : '')).join(',');
  });

  const date = new Date().toISOString().slice(0, 10);
  setDownloadHeaders(res, `${chargerId}_meter_values_${date}.csv`);
  res.send([headers.join(','), ...csvRows].join('\n'));
});

// GET /api/export/:chargerId/logs
router.get('/:chargerId/logs', async (req, res) => {
  const { chargerId } = req.params;
  const { from, to } = req.query;

  let query = supabase
    .from('ocpp_logs')
    .select('created_at, direction, action, message_id, payload')
    .eq('charger_id', chargerId)
    .order('created_at', { ascending: true })
    .limit(20000);

  query = buildDateFilter(query, 'created_at', from, to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const headers = ['timestamp', 'direction', 'action', 'message_id', 'payload_json'];
  const csvRows = (data || []).map((r) => [
    r.created_at ?? '',
    r.direction ?? '',
    csvEscape(r.action),
    csvEscape(r.message_id),
    csvEscape(JSON.stringify(r.payload)),
  ].join(','));

  const date = new Date().toISOString().slice(0, 10);
  setDownloadHeaders(res, `${chargerId}_ocpp_logs_${date}.csv`);
  res.send([headers.join(','), ...csvRows].join('\n'));
});

module.exports = router;
