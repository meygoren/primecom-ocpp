const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const requireRole = require('../middleware/requireRole');
const { extractBmsLog, analyzeBmsLog, mergeSettings, DEFAULT_SETTINGS, SUMMARY_VERSION } = require('../services/bmsAnalyzer');
const { buildTrend } = require('../services/bmsTrend');
const claude = require('../services/claude');

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

// Every log for one battery up to (and including) `uptoIso`, oldest first,
// as a day-by-day trend. Summaries written by older analysis code are
// recomputed once so every point has the same fields.
async function loadTrend(hwid, uptoIso, settings) {
  if (!hwid) return null;
  const { data: rows, error } = await supabase
    .from('bms_reports')
    .select('id, start_time, file_name, summary')
    .eq('hwid', hwid)
    .lte('start_time', uptoIso)
    .order('start_time', { ascending: false })
    .limit(120);
  if (error) throw new Error(error.message);

  for (const row of rows || []) {
    if (row.summary?.summary_version === SUMMARY_VERSION) continue;
    const { data: full } = await supabase.from('bms_reports').select('*').eq('id', row.id).single();
    if (!full?.data) continue;
    row.summary = analyzeBmsLog(toExtracted(full), settings).summary;
    await supabase.from('bms_reports').update({ summary: row.summary }).eq('id', row.id);
  }
  return buildTrend([...(rows || [])].reverse());
}

// One report with its analysis (current settings), the previous log from the
// same battery and the trend up to this log.
async function loadFullReport(id) {
  const { data: row, error } = await supabase.from('bms_reports').select('*').eq('id', id).single();
  if (error || !row) {
    const err = new Error('Report not found');
    err.status = 404;
    throw err;
  }

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

  const trend = await loadTrend(row.hwid, row.start_time, settings);
  const { data: _d, cell_stats: _c, temp_stats: _t, ...info } = row;
  return { report: { ...info, summary: analysis.summary }, analysis, previous, trend };
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
// Query: ?name=<original file name>. Header: Content-Type: application/octet-stream
router.post(
  '/reports',
  operatorUp,
  express.raw({ type: () => true, limit: '300mb' }),
  async (req, res) => {
    // File name travels in the query string: a custom header would need its own
    // CORS allowance, and the browser blocks the upload without one.
    const fileName = String(req.query.name || decodeURIComponent(req.get('x-file-name') || '') || 'bms-log.xlsx');
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
        .select('id, data->frames->t')
        .eq('hwid', meta.hwid)
        .eq('start_time', startIso)
        .eq('end_time', endIso)
        .eq('row_count', summary.samples)
        .maybeSingle();
      if (dupe) {
        // Uploaded before pack snapshots existed: refresh the stored data.
        if (!dupe.t) {
          await supabase
            .from('bms_reports')
            .update({ meta: extracted.meta, data: extracted.data, cell_stats: extracted.cell_stats, temp_stats: extracted.temp_stats, summary })
            .eq('id', dupe.id);
          return res.json({ id: dupe.id, duplicate: true, refreshed: true, hwid: meta.hwid, assignment: settings.fleet.systems[meta.hwid] || null });
        }
        return res.json({ id: dupe.id, duplicate: true, hwid: meta.hwid, assignment: settings.fleet.systems[meta.hwid] || null });
      }

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
      res.json({ id: data.id, duplicate: false, hwid: meta.hwid, assignment: settings.fleet.systems[meta.hwid] || null });
    } catch (err) {
      console.error(`[BMS] Upload failed for ${fileName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/bms/reports/:id — full analysis, re-run with the current settings,
// plus the previous log and the trend for the same battery.
router.get('/reports/:id', anyRole, async (req, res) => {
  try {
    res.json(await loadFullReport(req.params.id));
  } catch (err) {
    if (err.status !== 404) console.error('[BMS] Analysis failed:', err.message);
    res.status(err.status || 500).json({ error: err.message });
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

// --- readings export ---------------------------------------------------------

const READING_COLUMNS = [
  ['device_time', 'Device time', '设备时间'],
  ['t', 'UTC time', 'UTC 时间'],
  ['state', 'State (from current)', '状态（按电流）'],
  ['soc', 'SOC (%)', 'SOC (%)'],
  ['soh', 'SOH (%)', 'SOH (%)'],
  ['v', 'Pack voltage (V)', '总电压 (V)'],
  ['i', 'Current (A, − = discharge)', '电流 (A，负值=放电)'],
  ['kw', 'Power (kW, − = discharge)', '功率 (kW，负值=放电)'],
  ['max_cell_v', 'Highest cell (V)', '最高单体电压 (V)'],
  ['max_cell_id', 'Highest cell #', '最高单体编号'],
  ['min_cell_v', 'Lowest cell (V)', '最低单体电压 (V)'],
  ['min_cell_id', 'Lowest cell #', '最低单体编号'],
  ['cell_spread_v', 'Cell spread (V)', '压差 (V)'],
  ['cell_avg_v', 'Average cell (V)', '平均单体电压 (V)'],
  ['max_t', 'Hottest sensor (°C)', '最高温度 (°C)'],
  ['max_t_id', 'Hottest sensor #', '最高温度探头编号'],
  ['min_t', 'Coolest sensor (°C)', '最低温度 (°C)'],
  ['min_t_id', 'Coolest sensor #', '最低温度探头编号'],
  ['avg_t', 'Average temperature (°C)', '平均温度 (°C)'],
  ['insul_kohm', 'Insulation (kΩ)', '绝缘电阻 (kΩ)'],
  ['supply_v', '12 V supply (V)', '低压供电 (V)'],
  ['balancing', 'Cells balancing', '均衡中的电芯数'],
  ['chg_conn', 'Charging connection', '充电连接'],
  ['chg_req_v', 'Charger requested V', '充电需求电压 (V)'],
  ['chg_req_a', 'Charger requested A', '充电需求电流 (A)'],
  ['chg_out_v', 'Charger output V', '充电机输出电压 (V)'],
  ['chg_out_a', 'Charger output A', '充电机输出电流 (A)'],
  ['chg_fault', 'Charger fault', '充电机故障'],
  ['dchg_total_wh', 'Lifetime discharge (Wh)', '累计放电 (Wh)'],
  ['chg_total_wh', 'Lifetime charge (Wh)', '累计充电 (Wh)'],
  ['fault_code', 'Fault code', '故障码'],
  ['fault_name', 'Fault name', '故障名称'],
  ['fault_level', 'Fault level', '故障等级'],
  ['snapshot', 'Fault snapshot', '故障快照'],
];

// GET /api/bms/reports/:id/readings.csv?lang=en|zh — every reading in the log
router.get('/reports/:id/readings.csv', anyRole, async (req, res) => {
  const zh = req.query.lang === 'zh';
  const { data: row, error } = await supabase
    .from('bms_reports')
    .select('id, file_name, hwid, label, start_time, data')
    .eq('id', req.params.id)
    .single();
  if (error || !row?.data) return res.status(404).json({ error: 'Report not found' });

  const d = row.data;
  const settings = await loadSettings();
  const idle = settings.events.idle_current_a;
  const stateLabel = (i) => {
    if (i == null || Math.abs(i) < idle) return zh ? '静置' : 'idle';
    return i < 0 ? (zh ? '放电' : 'discharge') : (zh ? '充电' : 'charge');
  };
  const cell = (v) => {
    if (v == null) return '';
    const str = String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [READING_COLUMNS.map((c) => cell(zh ? c[2] : c[1])).join(',')];
  for (let k = 0; k < d.t.length; k++) {
    const values = READING_COLUMNS.map(([key]) => {
      if (key === 't') return d.t[k] != null ? new Date(d.t[k]).toISOString().replace('T', ' ').slice(0, 19) : '';
      if (key === 'kw') return d.v[k] != null && d.i[k] != null ? Math.round(d.v[k] * d.i[k]) / 1000 : '';
      if (key === 'state') return stateLabel(d.i[k]);
      return d[key]?.[k] ?? '';
    });
    lines.push(values.map(cell).join(','));
  }

  const base = (row.label || row.hwid || 'battery').replace(/[^\w.-]+/g, '_');
  const day = row.start_time ? String(row.start_time).slice(0, 10) : 'log';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${base}-${day}-readings${zh ? '-zh' : ''}.csv"`);
  // BOM so Excel opens Chinese headers correctly.
  res.send('﻿' + lines.join('\r\n'));
});

// --- trend -------------------------------------------------------------------

// GET /api/bms/batteries/:hwid/trend — every log for this battery
router.get('/batteries/:hwid/trend', anyRole, async (req, res) => {
  try {
    const settings = await loadSettings();
    res.json(await loadTrend(req.params.hwid, new Date(Date.now() + 86400000).toISOString(), settings));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Claude --------------------------------------------------------------------

// GET /api/bms/ai-settings — whether a key is set (never the key itself)
router.get('/ai-settings', anyRole, async (_req, res) => {
  try {
    const cfg = await claude.getAiConfig();
    res.json({ configured: !!cfg.apiKey, source: cfg.source, key_hint: cfg.keyHint, model: cfg.model, models: claude.MODELS, updated_at: cfg.updatedAt, updated_by: cfg.updatedBy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bms/ai-settings — body: { api_key?, clear_key?, model? } (admins)
router.put('/ai-settings', adminOnly, async (req, res) => {
  const updates = { updated_at: new Date().toISOString(), updated_by: req.user?.email || null };
  const { api_key, clear_key, model } = req.body || {};

  if (model !== undefined) {
    if (!claude.MODELS.some((m) => m.id === model)) return res.status(400).json({ error: 'Unknown model' });
    updates.model = model;
  }
  if (clear_key) updates.anthropic_api_key = null;
  else if (api_key) {
    const key = String(api_key).trim();
    try {
      await claude.verifyKey(key);
    } catch (err) {
      return res.status(400).json({ error: claude.describeError(err) });
    }
    updates.anthropic_api_key = key;
  }

  const { error } = await supabase.from('app_ai_settings').upsert({ id: 1, ...updates });
  if (error) return res.status(500).json({ error: `${error.message} — ${claude.MIGRATION_HINT}` });

  const cfg = await claude.getAiConfig();
  res.json({ configured: !!cfg.apiKey, source: cfg.source, key_hint: cfg.keyHint, model: cfg.model, models: claude.MODELS });
});

async function requireClaude(res) {
  const cfg = await claude.getAiConfig();
  if (!cfg.apiKey) {
    res.status(400).json({ error: 'No Anthropic API key yet. An admin can add one under Claude settings on the BMS Reports page.' });
    return null;
  }
  return cfg;
}

// GET /api/bms/reports/:id/chat
router.get('/reports/:id/chat', anyRole, async (req, res) => {
  const { data, error } = await supabase
    .from('bms_chat')
    .select('id, role, content, author, model, created_at')
    .eq('report_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: `${error.message} — ${claude.MIGRATION_HINT}` });
  res.json(data);
});

// DELETE /api/bms/reports/:id/chat — start the conversation over
router.delete('/reports/:id/chat', operatorUp, async (req, res) => {
  const { error } = await supabase.from('bms_chat').delete().eq('report_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/bms/reports/:id/chat — body: { message } → streams Claude's reply
router.post('/reports/:id/chat', operatorUp, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is empty' });

  try {
    const cfg = await requireClaude(res);
    if (!cfg) return;
    const full = await loadFullReport(req.params.id);

    const { data: history, error } = await supabase
      .from('bms_chat')
      .select('role, content')
      .eq('report_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`${error.message} — ${claude.MIGRATION_HINT}`);

    const { error: insErr } = await supabase.from('bms_chat').insert({ report_id: req.params.id, role: 'user', content: message, author: req.user?.email || null });
    if (insErr) throw new Error(insErr.message);

    // The report data rides in the first user turn so it stays in the cached prefix.
    const turns = [...(history || []), { role: 'user', content: message }];
    const messages = turns.map((t, k) => ({
      role: t.role,
      content: k === 0
        ? [{ type: 'text', text: `BMS report data (JSON):\n${claude.buildContext(full)}` }, { type: 'text', text: t.content }]
        : t.content,
    }));

    await claude.streamReply(res, {
      apiKey: cfg.apiKey,
      model: cfg.model,
      effort: 'medium',
      system: claude.SYSTEM_PROMPT,
      messages,
      onDone: async (text, model) => {
        await supabase.from('bms_chat').insert({ report_id: req.params.id, role: 'assistant', content: text, model });
      },
    });
  } catch (err) {
    if (!res.headersSent) res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/bms/reports/:id/analysis — body: { lang: 'en' | 'zh' } → streams
// Claude's written review and saves it on the report.
router.post('/reports/:id/analysis', operatorUp, async (req, res) => {
  const lang = req.body?.lang === 'zh' ? 'zh' : 'en';
  try {
    const cfg = await requireClaude(res);
    if (!cfg) return;
    const full = await loadFullReport(req.params.id);

    const { data: chat } = await supabase
      .from('bms_chat')
      .select('role, content')
      .eq('report_id', req.params.id)
      .order('created_at', { ascending: true });
    const chatNote = chat?.length
      ? `\n\nThe team has also discussed this report with you. Take that conversation into account:\n${chat.map((c) => `${c.role === 'user' ? 'Team' : 'Claude'}: ${c.content}`).join('\n\n')}`
      : '';

    await claude.streamReply(res, {
      apiKey: cfg.apiKey,
      model: cfg.model,
      effort: 'high',
      system: claude.SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `BMS report data (JSON):\n${claude.buildContext(full)}` },
          { type: 'text', text: claude.ANALYSIS_REQUEST[lang] + chatNote },
        ],
      }],
      onDone: async (text, model) => {
        const current = full.report.ai_analysis || {};
        await supabase
          .from('bms_reports')
          .update({ ai_analysis: { ...current, [lang]: { text, model, at: new Date().toISOString() } } })
          .eq('id', req.params.id);
      },
    });
  } catch (err) {
    if (!res.headersSent) res.status(err.status || 500).json({ error: err.message });
  }
});

// --- page change requests ------------------------------------------------------
// Anyone signed in can submit a request (with their name). Claude reads it and
// drafts a proposal, but nothing is applied until an admin approves it. Admins
// are emailed about every new request.

const REQUESTS_HINT = 'run supabase_migration_bms_requests.sql in the Supabase SQL editor';
const REQUEST_STATUSES = ['pending', 'approved', 'in_progress', 'done', 'declined'];

// Who gets the "new change request" email: the saved list, or every admin.
async function requestRecipients() {
  const { data: row } = await supabase.from('app_ai_settings').select('request_notify_emails').eq('id', 1).maybeSingle();
  const saved = (row?.request_notify_emails || []).filter(Boolean);
  if (saved.length) return { emails: saved, source: 'list' };

  const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
  const ids = new Set((admins || []).map((a) => a.id));
  if (!ids.size) return { emails: [], source: 'admins' };
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) return { emails: [], source: 'admins' };
  return { emails: (data?.users || []).filter((u) => ids.has(u.id) && u.email).map((u) => u.email), source: 'admins' };
}

async function notifyNewRequest(row, pageUrl) {
  try {
    const { emails } = await requestRecipients();
    if (!emails.length) {
      console.log('[BMS] New change request — no one to email (no admin accounts or saved recipients)');
      return;
    }
    const { sendEmail } = require('../services/alertService');
    const ai = row.ai;
    const kinds = { settings: 'Settings change', code: 'Code change', both: 'Settings + code change', question: 'Needs more detail' };
    const subject = `BMS change request from ${row.requester_name || row.author || 'the team'}${ai?.title ? ` — ${ai.title}` : ''}`;
    const lines = [
      `${row.requester_name || 'Someone'} requested a change to the BMS Reports page.`,
      `Nothing has been changed — it is waiting for your approval.`,
      ``,
      `Name    : ${row.requester_name || '(not given)'}`,
      `Account : ${row.author || '(unknown)'}`,
      `Sent    : ${new Date(row.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} (Pacific)`,
      ``,
      `What they asked for:`,
      row.request,
      ``,
    ];
    if (ai) {
      lines.push(`Claude's reading (${kinds[ai.kind] || ai.kind}):`, ai.summary, ``);
      if (ai.settings_changes?.length) {
        lines.push('Settings it would change (only if you approve):');
        for (const c of ai.settings_changes) lines.push(`  - ${c.group} > ${c.key}: ${c.previous} -> ${c.value}  (${c.reason})`);
        lines.push('');
      }
      if (ai.code_spec) lines.push('Needs a code change — the developer spec is on the request page.', '');
      if (ai.questions?.length) lines.push('Claude would ask:', ...ai.questions.map((q) => `  - ${q}`), '');
    } else {
      lines.push('Claude has not read this request yet.', '');
    }
    lines.push(`Approve or decline: ${pageUrl}`);

    for (const email of emails) await sendEmail(email, subject, lines.join('\n'));
  } catch (err) {
    console.error('[BMS] Change request email failed:', err.message);
  }
}

function pageUrlFrom(req) {
  const base = process.env.APP_URL || req.get('origin') || '';
  return `${base.replace(/\/$/, '')}/bms?view=requests`;
}

// GET /api/bms/requests
router.get('/requests', anyRole, async (_req, res) => {
  const { data, error } = await supabase
    .from('bms_change_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return res.status(500).json({ error: `${error.message} — ${REQUESTS_HINT}` });
  res.json((data || []).map((r) => ({ ...r, status: r.status === 'open' ? 'pending' : r.status })));
});

// Asks Claude to read a request and stores the result on it. Never throws:
// the request stays saved when Claude is unavailable.
async function interpretAndStore(row) {
  const cfg = await claude.getAiConfig();
  if (!cfg.apiKey) return { ...row, ai_error: 'No Anthropic API key yet — the request is saved, but Claude has not read it.' };
  try {
    const settings = await loadSettings();
    const ai = await claude.interpretRequest({ apiKey: cfg.apiKey, model: cfg.model, text: row.request, settings });
    const { data } = await supabase.from('bms_change_requests').update({ ai }).eq('id', row.id).select().single();
    return data || { ...row, ai };
  } catch (err) {
    console.error('[BMS] Request interpretation failed:', err.message);
    return { ...row, ai_error: claude.describeError(err) };
  }
}

// POST /api/bms/requests — body: { request, requester_name }. Anyone signed in.
router.post('/requests', anyRole, async (req, res) => {
  const text = String(req.body?.request || '').trim();
  const name = String(req.body?.requester_name || '').trim();
  if (!name) return res.status(400).json({ error: 'Please enter your name' });
  if (!text) return res.status(400).json({ error: 'Describe the change you want' });

  const { data: row, error } = await supabase
    .from('bms_change_requests')
    .insert({ request: text.slice(0, 8000), requester_name: name.slice(0, 120), author: req.user?.email || null, status: 'pending' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: `${error.message} — ${REQUESTS_HINT}` });

  const result = await interpretAndStore(row);
  // Email the admins in the background — the requester does not wait on it.
  notifyNewRequest(result, pageUrlFrom(req));
  res.json(result);
});

// POST /api/bms/requests/:id/interpret — ask Claude again (does not apply anything)
router.post('/requests/:id/interpret', operatorUp, async (req, res) => {
  const { data: row, error } = await supabase.from('bms_change_requests').select('*').eq('id', req.params.id).single();
  if (error || !row) return res.status(404).json({ error: 'Request not found' });
  res.json(await interpretAndStore(row));
});

// POST /api/bms/requests/:id/approve — admins only.
// Body: { apply_settings: boolean, note? }. Settings Claude proposed are
// applied only here, and only when apply_settings is true.
router.post('/requests/:id/approve', adminOnly, async (req, res) => {
  const { data: row, error } = await supabase.from('bms_change_requests').select('*').eq('id', req.params.id).single();
  if (error || !row) return res.status(404).json({ error: 'Request not found' });

  const changes = row.ai?.settings_changes || [];
  const applySettings = !!req.body?.apply_settings && changes.length > 0;
  const now = new Date().toISOString();
  const who = req.user?.email || null;

  try {
    let merged = null;
    if (applySettings) {
      const settings = await loadSettings();
      for (const c of changes) {
        if (settings[c.group] && c.key in settings[c.group]) settings[c.group][c.key] = c.value;
      }
      merged = mergeSettings(settings);
      const { error: sErr } = await supabase.from('bms_settings').upsert({ id: 1, settings: merged, updated_at: now });
      if (sErr) throw new Error(sErr.message);
    }

    // Settings-only request + settings applied = finished. Anything that
    // still needs code stays "approved" until it is built.
    const status = applySettings && row.ai?.kind === 'settings' ? 'done' : 'approved';
    const update = { status, decided_at: now, decided_by: who, decision_note: req.body?.note ? String(req.body.note).slice(0, 2000) : null };
    if (applySettings) Object.assign(update, { applied_at: now, applied_by: who });

    const { data, error: uErr } = await supabase.from('bms_change_requests').update(update).eq('id', row.id).select().single();
    if (uErr) throw new Error(uErr.message);
    res.json({ request: data, settings: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bms/requests/:id/decline — admins only. Body: { note? }
router.post('/requests/:id/decline', adminOnly, async (req, res) => {
  const { data, error } = await supabase
    .from('bms_change_requests')
    .update({ status: 'declined', decided_at: new Date().toISOString(), decided_by: req.user?.email || null, decision_note: req.body?.note ? String(req.body.note).slice(0, 2000) : null })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/bms/requests/:id — admins only. Body: { status } (e.g. in_progress, done)
router.patch('/requests/:id', adminOnly, async (req, res) => {
  const status = req.body?.status;
  if (!REQUEST_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const { data, error } = await supabase.from('bms_change_requests').update({ status }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/bms/requests/:id
router.delete('/requests/:id', adminOnly, async (req, res) => {
  const { error } = await supabase.from('bms_change_requests').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// GET /api/bms/request-settings — who is emailed about new requests (admins)
router.get('/request-settings', adminOnly, async (_req, res) => {
  try {
    const { data: row } = await supabase.from('app_ai_settings').select('request_notify_emails').eq('id', 1).maybeSingle();
    const recipients = await requestRecipients();
    res.json({
      emails: row?.request_notify_emails || [],
      effective: recipients.emails,
      email_configured: !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bms/request-settings — body: { emails: [...] } (admins). Empty = all admins.
router.put('/request-settings', adminOnly, async (req, res) => {
  const emails = [...new Set((Array.isArray(req.body?.emails) ? req.body.emails : [])
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
  const { error } = await supabase.from('app_ai_settings').upsert({ id: 1, request_notify_emails: emails });
  if (error) return res.status(500).json({ error: `${error.message} — ${REQUESTS_HINT}` });
  const recipients = await requestRecipients();
  res.json({ emails, effective: recipients.emails, email_configured: !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) });
});

// --- trucks & battery systems ---------------------------------------------------
// 6 trucks (the Charge Trucks list), each with a passenger-side and a
// driver-side battery system. Each system is identified by the BMS HWID in
// its log files; settings.fleet.systems maps HWID → { truck, side }.
//
// What is compared where:
//   per system — cell balance, weak cells, module heat map, SOH, insulation,
//                faults: hardware-specific, only meaningful against itself.
//   per truck  — passenger vs driver: same trips, same ambient, same
//                vehicles — differences in energy share, temperature, SOH or
//                capacity point at one side.
//   fleet      — energy delivered, usable capacity, time to discharge,
//                cycles, SOH: same design, so outliers stand out.

const SIDES = ['driver', 'passenger'];

async function truckList() {
  const { data } = await supabase.from('charge_trucks').select('truck_number, label').order('truck_number');
  const rows = (data || []).filter((t) => t.truck_number != null);
  if (rows.length) return rows.map((t) => ({ truck: Number(t.truck_number), name: t.label || `Truck ${t.truck_number}` }));
  return [1, 2, 3, 4, 5, 6].map((n) => ({ truck: n, name: `Truck ${n}` }));
}

// Report summaries (no time series), refreshing ones written by older code.
async function loadSummaries({ hwid, since, settings } = {}) {
  let q = supabase
    .from('bms_reports')
    .select('id, hwid, label, file_name, start_time, end_time, summary')
    .order('start_time', { ascending: false })
    .limit(2000);
  if (hwid) q = q.eq('hwid', hwid);
  if (since) q = q.gte('start_time', since);
  const { data, error } = await q;
  if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);

  let refreshed = 0;
  for (const row of data || []) {
    if (row.summary?.summary_version === SUMMARY_VERSION || refreshed >= 40) continue;
    const { data: full } = await supabase.from('bms_reports').select('*').eq('id', row.id).single();
    if (!full?.data) continue;
    row.summary = analyzeBmsLog(toExtracted(full), settings).summary;
    await supabase.from('bms_reports').update({ summary: row.summary }).eq('id', row.id);
    refreshed++;
  }
  return data || [];
}

const avg = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(Number(x))).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const sum = (xs) => xs.reduce((a, x) => a + (Number(x) || 0), 0);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

// Position label (e.g. "2b") of a BMS module number on a given side.
function positionOf(settings, side, module) {
  if (!module) return null;
  const grid = settings.pack.layouts[side] || settings.pack.layouts.driver;
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r].indexOf(module);
    if (c >= 0) return `${r + 1}${'abcdefghij'[c]}`;
  }
  return null;
}

// Headline numbers for one system over a set of its logs (newest first).
function systemStats(logs, settings, side) {
  const s = logs.map((l) => l.summary || {});
  const latest = s[0] || {};
  const hottest = {};
  for (const x of s) if (x.hottest_module) hottest[x.hottest_module] = (hottest[x.hottest_module] || 0) + 1;
  const topHot = Object.entries(hottest).sort((a, b) => b[1] - a[1])[0];
  return {
    logs: logs.length,
    last_log: logs[0]?.start_time || null,
    last_report_id: logs[0]?.id || null,
    energy_out_kwh: r1(sum(s.map((x) => x.discharge_kwh))),
    energy_in_kwh: r1(sum(s.map((x) => x.charge_kwh))),
    discharge_hours: r2(sum(s.map((x) => x.discharge_hours))),
    vehicle_charges_est: r1(sum(s.map((x) => x.vehicle_sessions_est))),
    measured_capacity_kwh: r1(avg(s.map((x) => x.measured_capacity_kwh))),
    full_discharge_hours: r2(avg(s.map((x) => x.full_discharge_hours))),
    avg_discharge_kw: r1(avg(s.map((x) => x.avg_discharge_kw))),
    peak_discharge_kw: s.length ? Math.max(...s.map((x) => x.peak_discharge_kw || 0)) || null : null,
    max_temp_c: s.length ? Math.max(...s.map((x) => x.max_temp_c ?? -99)) : null,
    max_cell_spread_mv: s.length ? Math.max(...s.map((x) => x.max_cell_spread_mv ?? 0)) : null,
    charge_restarts: sum(s.map((x) => x.charge_restarts)),
    soh: latest.soh ?? null,
    equivalent_full_cycles: latest.equivalent_full_cycles ?? null,
    lifetime_discharge_kwh: latest.lifetime_discharge_kwh ?? null,
    hottest_module: topHot ? Number(topHot[0]) : null,
    hottest_position: topHot ? positionOf(settings, side, Number(topHot[0])) : null,
    hottest_share: topHot ? r1((topHot[1] / s.length) * 100) : null,
    latest_warnings: latest.warnings || null,
  };
}

// GET /api/bms/fleet?days=30 — every truck, both sides, plus fleet totals.
router.get('/fleet', anyRole, async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const settings = await loadSettings();
    const systems = settings.fleet.systems;
    const [trucks, all] = await Promise.all([truckList(), loadSummaries({ settings })]);

    const byHwid = {};
    for (const row of all) (byHwid[row.hwid || 'unknown'] = byHwid[row.hwid || 'unknown'] || []).push(row);

    const windowLogs = (hwid) => (byHwid[hwid] || []).filter((l) => l.start_time >= since);
    const slots = trucks.map((t) => ({
      ...t,
      sides: Object.fromEntries(SIDES.map((side) => {
        const hwids = Object.entries(systems).filter(([, v]) => v.truck === t.truck && v.side === side).map(([h]) => h);
        // More than one serial on the same slot (e.g. a replaced BMS): newest log wins.
        hwids.sort((a, b) => ((byHwid[b]?.[0]?.start_time || '') > (byHwid[a]?.[0]?.start_time || '') ? 1 : -1));
        const hwid = hwids[0] || null;
        const recent = hwid ? windowLogs(hwid) : [];
        const latestAny = hwid ? byHwid[hwid]?.[0] : null;
        return [side, hwid ? {
          hwid,
          other_hwids: hwids.slice(1),
          ...systemStats(recent, settings, side),
          last_log: latestAny?.start_time || null,
          last_report_id: latestAny?.id || null,
          soh: latestAny?.summary?.soh ?? null,
          equivalent_full_cycles: latestAny?.summary?.equivalent_full_cycles ?? null,
          lifetime_discharge_kwh: latestAny?.summary?.lifetime_discharge_kwh ?? null,
          latest_warnings: latestAny?.summary?.warnings || null,
        } : null];
      })),
    }));

    for (const t of slots) {
      const d = t.sides.driver, p = t.sides.passenger;
      const both = [d, p].filter(Boolean);
      t.totals = {
        energy_out_kwh: r1(sum(both.map((x) => x.energy_out_kwh))),
        measured_capacity_kwh: both.every((x) => x.measured_capacity_kwh != null) && both.length === 2 ? r1(d.measured_capacity_kwh + p.measured_capacity_kwh) : null,
        vehicle_charges_est: r1(sum(both.map((x) => x.vehicle_charges_est))),
        passenger_share_pct: d && p && d.energy_out_kwh + p.energy_out_kwh > 0 ? r1((p.energy_out_kwh / (d.energy_out_kwh + p.energy_out_kwh)) * 100) : null,
        max_temp_diff_c: d && p && d.max_temp_c != null && p.max_temp_c != null ? r1(p.max_temp_c - d.max_temp_c) : null,
        soh_diff: d && p && d.soh != null && p.soh != null ? r1(p.soh - d.soh) : null,
      };
    }

    const assigned = new Set(Object.keys(systems).filter((h) => systems[h].truck != null && systems[h].side));
    const unassigned = Object.keys(byHwid).filter((h) => h !== 'unknown' && !assigned.has(h)).map((hwid) => ({
      hwid,
      logs: byHwid[hwid].length,
      last_log: byHwid[hwid][0]?.start_time,
      last_report_id: byHwid[hwid][0]?.id,
      side: systems[hwid]?.side || null,
    }));

    const sys = slots.flatMap((t) => SIDES.map((side) => t.sides[side] && { truck: t.truck, name: t.name, side, ...t.sides[side] })).filter(Boolean);
    const sohs = sys.map((x) => x.soh).filter((v) => v != null).sort((a, b) => a - b);
    const median = sohs.length ? sohs[Math.floor(sohs.length / 2)] : null;
    const fleet = {
      days,
      systems_assigned: sys.length,
      systems_reporting: sys.filter((x) => x.logs > 0).length,
      logs: sum(sys.map((x) => x.logs)),
      energy_out_kwh: r1(sum(sys.map((x) => x.energy_out_kwh))),
      vehicle_charges_est: r1(sum(sys.map((x) => x.vehicle_charges_est))),
      avg_capacity_kwh: r1(avg(sys.map((x) => x.measured_capacity_kwh))),
      avg_full_discharge_hours: r2(avg(sys.map((x) => x.full_discharge_hours))),
      median_soh: median,
      lowest_soh: sys.filter((x) => x.soh != null).sort((a, b) => a.soh - b.soh)[0] || null,
      hottest: sys.filter((x) => x.max_temp_c != null && x.logs).sort((a, b) => b.max_temp_c - a.max_temp_c)[0] || null,
      most_cycles: sys.filter((x) => x.equivalent_full_cycles != null).sort((a, b) => b.equivalent_full_cycles - a.equivalent_full_cycles)[0] || null,
    };
    for (const k of ['lowest_soh', 'hottest', 'most_cycles']) {
      const x = fleet[k];
      if (x) fleet[k] = { truck: x.truck, name: x.name, side: x.side, hwid: x.hwid, soh: x.soh, max_temp_c: x.max_temp_c, equivalent_full_cycles: x.equivalent_full_cycles };
    }

    res.json({ trucks: slots, unassigned, fleet });
  } catch (err) {
    console.error('[BMS] Fleet summary failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bms/systems/:hwid — one battery system: its assignment, all its
// logs, headline numbers and the day-by-day trend.
router.get('/systems/:hwid', anyRole, async (req, res) => {
  try {
    const settings = await loadSettings();
    const hwid = req.params.hwid;
    const assignment = settings.fleet.systems[hwid] || null;
    const logs = await loadSummaries({ hwid, settings });
    if (!logs.length) return res.status(404).json({ error: 'No logs for this battery system' });
    const trucks = await truckList();
    const truck = assignment?.truck != null ? trucks.find((t) => t.truck === assignment.truck) : null;
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    res.json({
      hwid,
      assignment,
      truck_name: truck?.name || (assignment?.truck != null ? `Truck ${assignment.truck}` : null),
      label: logs[0].label || null,
      all_time: systemStats(logs, settings, assignment?.side),
      last_30_days: systemStats(logs.filter((l) => l.start_time >= since30), settings, assignment?.side),
      trend: buildTrend([...logs].reverse()),
      logs: logs.map((l) => ({ id: l.id, start_time: l.start_time, end_time: l.end_time, file_name: l.file_name, summary: l.summary })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bms/systems/:hwid — body: { truck, side }. Saves which truck and
// side this BMS serial belongs to; future uploads are recognised automatically.
router.put('/systems/:hwid', operatorUp, async (req, res) => {
  const hwid = req.params.hwid;
  const truck = req.body?.truck == null || req.body.truck === '' ? null : Number(req.body.truck);
  const side = SIDES.includes(req.body?.side) ? req.body.side : null;
  if (truck != null && !Number.isFinite(truck)) return res.status(400).json({ error: 'Unknown truck' });

  try {
    const settings = await loadSettings();
    const systems = { ...settings.fleet.systems };
    if (truck == null && !side) delete systems[hwid];
    else systems[hwid] = { truck, side };
    // Another serial already on this exact slot? Report it so the page can say so.
    const clash = Object.entries(systems).filter(([h, v]) => h !== hwid && truck != null && v.truck === truck && v.side === side).map(([h]) => h);
    const merged = mergeSettings({ ...settings, fleet: { systems }, pack: { ...settings.pack, mounts: {} } });
    const { error } = await supabase.from('bms_settings').upsert({ id: 1, settings: merged, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    res.json({ hwid, assignment: merged.fleet.systems[hwid] || null, also_on_this_slot: clash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
