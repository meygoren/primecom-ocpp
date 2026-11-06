const Anthropic = require('@anthropic-ai/sdk').default;
const supabase = require('../db/supabase');

// Claude (Anthropic API) for the BMS Reports tab: written analyses and a chat
// about each report.
//
// The API key comes from the ANTHROPIC_API_KEY variable on the server if set,
// otherwise from the app_ai_settings table (entered by an admin on the BMS
// Reports page). The key never leaves the server.

const DEFAULT_MODEL = 'claude-opus-5-5';
const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (most capable)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, lower cost)' },
];
// Server-side fallback: if a model declines a request, the API re-runs it on
// a suitable fallback model instead of returning a refusal.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const MIGRATION_HINT = 'run supabase_migration_bms_ai.sql in the Supabase SQL editor';

async function loadAiSettings() {
  const { data, error } = await supabase.from('app_ai_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(`${error.message} — ${MIGRATION_HINT}`);
  return data || {};
}

async function getAiConfig() {
  const row = await loadAiSettings();
  const envKey = process.env.ANTHROPIC_API_KEY;
  const apiKey = envKey || row.anthropic_api_key || null;
  return {
    apiKey,
    source: envKey ? 'server variable' : row.anthropic_api_key ? 'saved in app' : null,
    keyHint: apiKey ? `…${apiKey.slice(-4)}` : null,
    model: MODELS.some((m) => m.id === row.model) ? row.model : DEFAULT_MODEL,
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

function makeClient(apiKey) {
  return new Anthropic({ apiKey });
}

// Turns SDK errors into a sentence for the page.
function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'The Anthropic API key was rejected. Check it in Claude settings.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key does not have access to the selected model.';
  if (err instanceof Anthropic.RateLimitError) return 'Anthropic rate limit reached — wait a minute and try again.';
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status || ''}: ${err.message}`.trim();
  return err.message || 'Unknown error talking to Claude';
}

// Checks a key by listing one model.
async function verifyKey(apiKey) {
  await makeClient(apiKey).models.list({ limit: 1 });
}

// --- prompts ------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a battery systems engineer helping the Primecom Technologies operations team review logs from their mobile battery energy storage systems.

How the system works:
- Each Primecom battery system is a ~456 kWh pack (460.8 V nominal, 990 Ah, 432 cells, 144 temperature sensors; cell voltages around 3.2–3.6 V suggest LFP chemistry). The BMS reports one reading about every 32 seconds.
- The battery is recharged from AC-DC chargers (rated 480 kW each) that Primecom manages over OCPP.
- The battery discharges through DC-DC chargers into customer vehicles — currently Hyundai Ioniq 5s for this battery (about 54 kWh for a typical 10→80% charge). Several vehicles can charge at once.
- The pack is 9 modules (48 cells, 16 temperature sensors each) in a 3×3 stack: 3 modules in series per string, 3 strings in parallel. Each truck carries two packs, one on the passenger side and one on the driver side, facing outward. The JSON includes per-module temperature and cell balance with the physical position of each module — use it to say where in the stack heat or weak cells are.
- In these logs, negative pack current means discharging to vehicles and positive means charging from the AC-DC charger. The discharge current limit is 990 A and the system is rated about 450 kW.
- Higher cell temperatures make the BMS reduce allowed current, so output drops as the pack heats up.

You receive a JSON summary produced by Primecom's own analysis code (not the raw log): headline numbers, charge/discharge sessions, warnings, temperature vs power bands, weakest cells and hottest sensors, data gaps, faults, the previous log from the same battery, and a day-by-day trend across all uploaded logs for this battery. Team notes are the team's own observations — take them seriously and say when the data supports or contradicts them.

How to answer:
- Be specific and practical: cite the numbers, times, cell and sensor IDs you are relying on.
- Separate what the data shows from what you are inferring, and say what extra data would settle an open question.
- Rank concerns by operational risk. Do not invent problems; say plainly when something looks normal.
- Keep it readable for a non-specialist operations team. Use short Markdown headings and bullet points; no tables wider than four columns.
- Write in the language the request asks for. When asked for Simplified Chinese, write natural technical Chinese and keep cell/sensor IDs, units and numbers as they are.`;

const ANALYSIS_REQUEST = {
  en: `Write a review of this BMS log for the Primecom operations team, in English. Use these sections:
1. Summary — two or three sentences on what happened in this period.
2. Performance — energy in/out, power, current against the 990 A limit, charging behaviour.
3. Temperature and cells — heat, derating, cell balance, weak cells, hot spots.
4. Trend — how this log compares with the previous one and the direction across all logs for this battery.
5. Concerns — ranked, each with why it matters.
6. Recommended actions — concrete next steps for the team.`,
  zh: `请用简体中文为 Primecom 运营团队撰写这份 BMS 日志的分析报告，包含以下部分：
1. 概述 —— 用两三句话说明本时段发生了什么。
2. 性能 —— 充放电能量、功率、电流与 990 A 限值的对比、充电情况。
3. 温度与电芯 —— 发热、降额、电芯一致性、弱电芯、局部过热点。
4. 趋势 —— 与上一份日志的对比，以及该电池所有日志的整体走向。
5. 关注问题 —— 按重要性排序，并说明原因。
6. 建议措施 —— 团队可执行的具体下一步。`,
};

// Compact JSON context for one report (the full time series is left out).
function buildContext({ report, analysis, previous, trend }) {
  const a = analysis;
  return JSON.stringify({
    battery: {
      name: report.label || null,
      hwid: a.meta.hwid,
      model: a.meta.device_model,
      rating: a.meta.nominal_v ? `${a.meta.nominal_v} V, ${a.meta.capacity_ah} Ah, ${a.meta.nominal_kwh} kWh` : null,
      cells: a.meta.cell_count,
      temp_sensors: a.meta.temp_sensor_count,
      vehicles_charged: report.vehicle || a.settings.limits.vehicle_name,
    },
    log: { file: report.file_name, start_utc: new Date(a.summary.start).toISOString(), end_utc: new Date(a.summary.end).toISOString() },
    limits: a.settings.limits,
    thresholds: a.settings.thresholds,
    summary: a.summary,
    warnings: a.warnings.map((w) => ({ level: w.level, message: w.message })),
    sessions: a.events,
    temperature_vs_power: a.derating,
    extremes: a.extremes,
    pack_layout: a.pack ? {
      build: a.pack.config,
      spec: a.pack.spec,
      mounted_on: a.pack.mount ? `${a.pack.mount} side of the truck, facing outward` : 'unknown',
      layout_note: 'Modules are numbered down each column as seen standing outside the truck facing the pack: column 1 = modules 1 (top), 2, 3 (bottom); column 2 = 4-6; column 3 = 7-9. Each column of modules is one series string; the strings are in parallel.',
      modules: a.pack.modules.map((m) => ({
        module: m.module, string: m.string, column: m.column, row: m.row,
        cells: `${m.cell_start}-${m.cell_end}`, sensors: m.sensor_start ? `${m.sensor_start}-${m.sensor_end}` : null,
        avg_temp_c: m.avg_temp_c, max_temp_c: m.max_temp_c, temp_vs_pack_c: m.temp_vs_pack_c,
        cell_vs_pack_mv: m.cell_vs_pack_mv, weakest_cell: m.weakest_cell, hottest_sensor: m.hottest_sensor,
      })),
      strings: a.pack.strings,
    } : null,
    weakest_cells: a.cells.weakest.slice(0, 6),
    hottest_sensors: a.temps.hottest.slice(0, 6),
    balancing_pct_of_readings: a.cells.balancing_pct,
    data_gaps: a.gaps,
    faults: a.faults,
    previous_log_summary: previous ? { start_utc: previous.start_time, summary: previous.summary } : null,
    trend_across_logs: trend,
    team_notes: report.notes || null,
  });
}

// Streams one Claude reply to an Express response as Server-Sent Events.
// Events: {type:'delta', text}, {type:'done', text, model}, {type:'error', error}
async function streamReply(res, { apiKey, model, effort, system, messages, onDone }) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let closed = false;
  res.on('close', () => { closed = true; });

  try {
    const client = makeClient(apiKey);
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 64000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort },
      cache_control: { type: 'ephemeral' },
      system,
      messages,
    });

    let text = '';
    for await (const event of stream) {
      if (closed) { stream.abort(); return; }
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text;
        send({ type: 'delta', text: event.delta.text });
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      send({ type: 'error', error: 'Claude declined to answer this request.' });
      return res.end();
    }
    if (final.stop_reason === 'max_tokens') text += '\n\n_(Reply was cut off at the length limit.)_';

    await onDone?.(text, final.model);
    send({ type: 'done', text, model: final.model });
    res.end();
  } catch (err) {
    console.error('[Claude] Request failed:', err.message);
    if (!closed) {
      send({ type: 'error', error: describeError(err) });
      res.end();
    }
  }
}

// --- page change requests -----------------------------------------------------

// What each analysis-settings group means. Claude sees these with the
// current values to decide whether a request can be met without code.
const SETTING_NOTES = {
  sections: 'true/false — which sections of the report page and PDF are shown',
  limits: 'numbers (vehicle_name is text) — system limits used by the analysis',
  thresholds: 'numbers — warning / critical thresholds',
  events: 'numbers — how charge/discharge sessions are detected',
};

const REQUEST_SYSTEM_PROMPT = `You triage change requests from the Primecom operations team about their BMS Reports page (part of their internal OCPP dashboard for EV chargers and battery systems).

The page: users upload daily .xlsx logs exported from the online BMS of a Primecom mobile battery system (~456 kWh, 432 cells, 144 temperature sensors). Server code analyzes each log into sections: overview tiles, warnings, comparison with the previous log, trend across logs, team notes, Claude analysis, Ask Claude chat, charge/discharge sessions table, power and SOC charts, temperature chart, temperature vs power bands, cell voltage charts, weak cells and hot spots, vehicles served, lifetime energy, insulation and 12 V supply, faults, data gaps. Reports can be shown and exported to PDF in English or Chinese, and every reading can be exported to CSV.

Some requests can be met just by changing the page's analysis settings (listed in the request with their current values). Everything else — new charts, new columns or parameters, layout, wording, new calculations, new exports, new integrations — needs a code change by a developer.

For each request:
- kind: "settings" if settings changes alone satisfy it, "code" if it needs development work, "both" if settings help now but code is needed for the rest, "question" if it is too unclear to act on.
- settings_changes: only keys that exist in the current settings, with the new value as a string (e.g. "true", "50", "Hyundai Ioniq 5"). Empty when none apply.
- code_spec: for code work, a clear spec a developer can implement: what to change, where on the page, what data it uses (say if the BMS export may not contain it), and how to check it is done. Markdown with short bullets. Empty string when no code is needed.
- questions: what you would need to ask the requester when something is ambiguous. Empty when clear.
- title: a short name for the request. summary: one or two sentences in plain language on what will change.
Write in the language the request is written in.`;

const REQUEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'title', 'summary', 'settings_changes', 'code_spec', 'questions'],
  properties: {
    kind: { type: 'string', enum: ['settings', 'code', 'both', 'question'] },
    title: { type: 'string' },
    summary: { type: 'string' },
    settings_changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['group', 'key', 'value', 'reason'],
        properties: {
          group: { type: 'string', enum: ['sections', 'limits', 'thresholds', 'events'] },
          key: { type: 'string' },
          value: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    code_spec: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
  },
};

// Converts Claude's string values to the type each setting uses and drops
// anything that is not a real setting or would not change anything.
function cleanSettingsChanges(changes, settings) {
  const out = [];
  for (const c of changes || []) {
    const group = settings[c.group];
    if (!group || !(c.key in group)) continue;
    const current = group[c.key];
    let value;
    if (typeof current === 'boolean') value = /^(true|yes|on|1)$/i.test(String(c.value).trim());
    else if (c.key === 'vehicle_name') value = String(c.value).trim();
    else {
      const num = parseFloat(String(c.value).replace(/[^0-9eE.+-]/g, ''));
      if (!Number.isFinite(num)) continue;
      value = num;
    }
    if (value === current) continue;
    out.push({ group: c.group, key: c.key, value, previous: current ?? null, reason: c.reason });
  }
  return out;
}

// One request in, Claude's structured reading out.
async function interpretRequest({ apiKey, model, text, settings }) {
  const client = makeClient(apiKey);
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: REQUEST_SCHEMA } },
    system: REQUEST_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        `Current page settings (group → key → value):\n${JSON.stringify(settings, null, 1)}`,
        `What each group means:\n${JSON.stringify(SETTING_NOTES, null, 1)}`,
        `Change request from the team:\n<request>\n${text}\n</request>`,
      ].join('\n\n'),
    }],
  });
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') throw new Error('Claude declined to read this request.');
  const raw = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = JSON.parse(raw);
  return {
    kind: parsed.kind,
    title: parsed.title,
    summary: parsed.summary,
    settings_changes: cleanSettingsChanges(parsed.settings_changes, settings),
    code_spec: parsed.code_spec || '',
    questions: parsed.questions || [],
    model: final.model,
    at: new Date().toISOString(),
  };
}

module.exports = {
  interpretRequest,
  DEFAULT_MODEL,
  MODELS,
  MIGRATION_HINT,
  SYSTEM_PROMPT,
  ANALYSIS_REQUEST,
  loadAiSettings,
  getAiConfig,
  verifyKey,
  describeError,
  buildContext,
  streamReply,
};
