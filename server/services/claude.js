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

module.exports = {
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
