const { openWorkbook } = require('./xlsxReader');

// BMS log analysis for Primecom battery systems.
//
// Input: the .xlsx export from the online BMS platform (one row every ~32 s:
// SOC, pack voltage/current, 432 cell voltages, 144 cell temperatures,
// insulation, charger handshake data, lifetime energy counters, faults).
//
// Two stages:
//   extractBmsLog(buffer)        — run once at upload. Pulls the useful fields
//                                  into a compact column store + per-cell stats.
//   analyzeBmsLog(data, settings) — run every time a report is viewed, so
//                                  changing a threshold (or improving this file)
//                                  updates every report already uploaded.
//
// Sign convention in these exports: current < 0 is DISCHARGE (battery feeding
// the DC-DC chargers → vehicles), current > 0 is CHARGE (AC-DC charger →
// battery). "Sys. State" says "Discharging" even when idle, so the state is
// derived from the current instead.

// --- default settings (editable on the BMS Reports page) -----------------------

const DEFAULT_SETTINGS = {
  sections: {
    overview: true,
    warnings: true,
    events: true,
    power_chart: true,
    temperature: true,
    temp_derating: true,
    cells: true,
    cell_outliers: true,
    insulation: true,
    energy: true,
    vehicles: true,
    faults: true,
    gaps: true,
    comparison: true,
  },
  limits: {
    discharge_current_a: 990,   // BMS discharge current limit
    system_kw: 450,             // battery system rated output
    charger_kw: 480,            // each AC-DC charger
    nominal_kwh: null,          // null = read from the file (e.g. 460.8 V × 990 Ah)
    vehicle_name: 'Hyundai Ioniq 5',
    vehicle_session_kwh: 54,    // energy for a typical 10→80% Ioniq 5 charge (77.4 kWh pack)
  },
  thresholds: {
    temp_warn_c: 45,
    temp_crit_c: 55,
    temp_spread_warn_c: 10,
    temp_rise_warn_c_per_min: 0.8,
    cell_spread_warn_v: 0.10,
    cell_spread_crit_v: 0.20,
    cell_high_warn_v: 3.60,
    cell_high_crit_v: 3.65,
    cell_low_warn_v: 3.00,
    cell_low_crit_v: 2.80,
    insulation_warn_ohm_per_v: 500,
    insulation_crit_ohm_per_v: 100,
    supply_low_v: 12.0,
    soh_warn_pct: 90,
    soc_low_warn_pct: 10,
    gap_warn_min: 15,
    interruptions_warn: 3,
    charger_shortfall_pct: 80,
    current_limit_pct: 97,
  },
  events: {
    idle_current_a: 5,          // |current| below this = idle
    merge_gap_min: 5,           // pauses shorter than this stay in the same session
    min_event_kwh: 0.5,         // ignore blips
  },
};

function mergeSettings(saved) {
  const s = saved || {};
  return {
    sections: { ...DEFAULT_SETTINGS.sections, ...(s.sections || {}) },
    limits: { ...DEFAULT_SETTINGS.limits, ...(s.limits || {}) },
    thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(s.thresholds || {}) },
    events: { ...DEFAULT_SETTINGS.events, ...(s.events || {}) },
  };
}

// --- helpers -------------------------------------------------------------------------

function num(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9eE.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// BMS "not available" sentinels.
function valid(v, { min = -Infinity, max = Infinity } = {}) {
  if (v == null) return null;
  if (v === 65535 || v === 65534 || v === -3276.8 || v === 6553.5) return null;
  return v >= min && v <= max ? v : null;
}

function round(v, d = 1) {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function parseUtc(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

function mode(arr) {
  const c = new Map();
  for (const v of arr) if (v != null) c.set(v, (c.get(v) || 0) + 1);
  let best = null;
  for (const [v, n] of c) if (!best || n > best[1]) best = [v, n];
  return best ? best[0] : null;
}

function median(arr) {
  const a = arr.filter((v) => v != null).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
}

// --- stage 1: extract ------------------------------------------------------------------

// Column store keys (one array per field, one entry per sample).
const FIELDS = [
  't', 'device_time', 'soc', 'soh', 'v', 'i', 'insul_kohm', 'supply_v',
  'max_cell_v', 'max_cell_id', 'min_cell_v', 'min_cell_id', 'cell_spread_v', 'cell_avg_v',
  'max_t', 'max_t_id', 'min_t', 'min_t_id', 'avg_t',
  'state', 'chg_conn', 'chg_req_v', 'chg_req_a', 'chg_out_v', 'chg_out_a', 'chg_fault',
  'dchg_total_wh', 'chg_total_wh', 'fault_code', 'fault_name', 'fault_level', 'snapshot',
  'balancing', 'hv4', 'hv5', 'signal',
];

async function extractBmsLog(buffer) {
  const wb = openWorkbook(buffer);
  const names = wb.sheets.map((s) => s.name);
  const dataSheet = names.find((n) => /^sheet1$/i.test(n)) || names[0];
  if (!dataSheet) throw new Error('The file has no sheets');

  // Project information sheet (battery identity + nominal rating).
  const meta = {};
  const infoName = names.find((n) => /project/i.test(n));
  if (infoName) {
    const [hdr, vals] = wb.readSheet(infoName);
    (hdr || []).forEach((h, i) => { if (h) meta[String(h).trim()] = vals?.[i] ?? null; });
  }

  let header = null;
  let col = null;
  const store = Object.fromEntries(FIELDS.map((f) => [f, []]));
  let cellCols = [];
  let tempCols = [];
  let cellAcc = null;
  let tempAcc = null;

  function find(re, from = 0) {
    for (let i = from; i < header.length; i++) if (re.test(String(header[i] ?? ''))) return i;
    return -1;
  }

  await wb.streamSheet(dataSheet, (values, styles, rowNumber) => {
    if (rowNumber === 0) {
      header = values.map((h) => (h == null ? '' : String(h).trim()));
      col = {
        time: find(/^Device Time$/i),
        utc: find(/^UTC$/i),
        state: find(/^Sys\. ?State$/i),
        soc: find(/^SOC$/i),
        soh: find(/^SOH$/i),
        v: find(/^Pack Volt/i),
        i: find(/^Current\(A\)$/i),
        i2: find(/^Current\(A\)$/i, find(/^Current\(A\)$/i) + 1),
        insul: find(/^System Insul/i),
        supply: find(/^supplyVolt/i),
        maxCellV: find(/^Max Cell V\.\(V\)/i),
        maxCellId: find(/^Max Cell V\. Code/i),
        minCellV: find(/^Min Cell V\.\(V\)/i),
        minCellId: find(/^Min Cell V\. Code/i),
        spread: find(/^voltage differential/i),
        maxT: find(/^Max Temp\.\(/i),
        maxTId: find(/^Max Temp\. ID/i),
        minT: find(/^Min Temp\.\(/i),
        minTId: find(/^Min Temp\. ID/i),
        signal: find(/^Signal Ind/i),
        chgConn: find(/^Charging Connection/i),
        chgReqV: find(/^Chg Req Volt/i),
        chgReqA: find(/^Chg Req Curr/i),
        chgOutV: find(/^Charger Output V/i),
        chgOutA: find(/^Charger Output C/i),
        chgFault: find(/^Charger Fault Status/i),
        dchgTotal: find(/^Total Dchg Cap/i),
        chgTotal: find(/^Total Chg Cap/i),
        faultCode: find(/^Fault Code$/i),
        faultName: find(/^Fault Name$/i),
        faultLevel: find(/^Fault Level$/i),
        snapshot: find(/^Snapshot data$/i),
        balancing: find(/^Balancing State$/i),
        hv4: find(/^HV4/i),
        hv5: find(/^HV5/i),
      };
      if (col.time < 0 || col.i < 0 || col.soc < 0) {
        throw new Error('This does not look like a BMS export (missing Device Time / Current / SOC columns)');
      }
      header.forEach((h, idx) => {
        const c = /^Cell Volt\.#(\d+)/i.exec(h);
        if (c) cellCols.push({ idx, n: +c[1] });
        const t = /^Cell Temp\.#(\d+)/i.exec(h);
        if (t) tempCols.push({ idx, n: +t[1] });
      });
      cellAcc = cellCols.map((c) => ({ n: c.n, min: Infinity, max: -Infinity, sum: 0, dev: 0, cnt: 0, low: 0, high: 0 }));
      tempAcc = tempCols.map((c) => ({ n: c.n, min: Infinity, max: -Infinity, sum: 0, dev: 0, cnt: 0, hot: 0, cold: 0 }));
      return;
    }

    const g = (k) => (col[k] >= 0 ? values[col[k]] : null);
    const deviceTime = g('time') ? String(g('time')) : null;
    if (!deviceTime) return;

    // Prefer the first Current(A) column; fall back to the second when the
    // first is a sentinel.
    let current = valid(num(g('i')), { min: -5000, max: 5000 });
    if (current == null && col.i2 >= 0) current = valid(num(values[col.i2]), { min: -5000, max: 5000 });

    // Per-cell voltages (mV) for this sample.
    let cellSum = 0, cellN = 0;
    const cv = cellCols.map((c) => {
      const v = valid(num(values[c.idx]), { min: 1000, max: 5000 });
      if (v != null) { cellSum += v; cellN++; }
      return v;
    });
    const cellMean = cellN ? cellSum / cellN : null;
    if (cellN) {
      let lo = 0, hi = 0;
      cv.forEach((v, k) => {
        if (v == null) return;
        const a = cellAcc[k];
        a.min = Math.min(a.min, v); a.max = Math.max(a.max, v);
        a.sum += v; a.dev += v - cellMean; a.cnt++;
        if (v < cv[lo] || cv[lo] == null) lo = k;
        if (v > cv[hi] || cv[hi] == null) hi = k;
      });
      cellAcc[lo].low++; cellAcc[hi].high++;
    }

    let tSum = 0, tN = 0;
    const tv = tempCols.map((c) => {
      const v = valid(num(values[c.idx]), { min: -39, max: 120 });
      if (v != null) { tSum += v; tN++; }
      return v;
    });
    const tMean = tN ? tSum / tN : null;
    if (tN) {
      let lo = -1, hi = -1;
      tv.forEach((v, k) => {
        if (v == null) return;
        const a = tempAcc[k];
        a.min = Math.min(a.min, v); a.max = Math.max(a.max, v);
        a.sum += v; a.dev += v - tMean; a.cnt++;
        if (lo < 0 || v < tv[lo]) lo = k;
        if (hi < 0 || v > tv[hi]) hi = k;
      });
      if (hi >= 0) tempAcc[hi].hot++;
      if (lo >= 0) tempAcc[lo].cold++;
    }

    // Balancing State: hex bitmap of cells currently balancing.
    let balancing = 0;
    const bal = g('balancing');
    if (bal) for (const h of String(bal).split(',')) { let b = parseInt(h, 16) || 0; while (b) { balancing += b & 1; b >>= 1; } }

    const text = (k) => { const v = g(k); return v == null || v === '' || v === '-' ? null : String(v); };
    const fill = [...styles].some((s) => s === '1' || s === '2' || s === '3'); // highlighted = fault snapshot

    const vPack = valid(num(g('v')), { min: 1, max: 2000 });
    const t = parseUtc(g('utc')) ?? parseUtc(deviceTime);

    const row = {
      t,
      device_time: deviceTime,
      soc: valid(num(g('soc')), { min: 0, max: 100 }),
      soh: valid(num(g('soh')), { min: 0, max: 100 }),
      v: vPack,
      i: current,
      insul_kohm: valid(num(g('insul')), { min: 0, max: 65000 }),
      supply_v: valid(num(g('supply')), { min: 1000, max: 40000 }) != null ? num(g('supply')) / 1000 : null,
      max_cell_v: valid(num(g('maxCellV')), { min: 1, max: 5 }),
      max_cell_id: num(g('maxCellId')),
      min_cell_v: valid(num(g('minCellV')), { min: 1, max: 5 }),
      min_cell_id: num(g('minCellId')),
      cell_spread_v: valid(num(g('spread')), { min: 0, max: 5 }),
      cell_avg_v: cellMean != null ? round(cellMean / 1000, 4) : null,
      max_t: valid(num(g('maxT')), { min: -39, max: 120 }),
      max_t_id: num(g('maxTId')),
      min_t: valid(num(g('minT')), { min: -39, max: 120 }),
      min_t_id: num(g('minTId')),
      avg_t: tMean != null ? round(tMean, 1) : null,
      state: text('state'),
      chg_conn: text('chgConn'),
      chg_req_v: valid(num(g('chgReqV')), { min: 1, max: 2000 }),
      chg_req_a: valid(num(g('chgReqA')), { min: 1, max: 5000 }),
      chg_out_v: valid(num(g('chgOutV')), { min: 1, max: 2000 }),
      chg_out_a: valid(num(g('chgOutA')), { min: 1, max: 5000 }),
      chg_fault: text('chgFault') && !/^(0x00,?)+$/i.test(text('chgFault')) ? text('chgFault') : null,
      dchg_total_wh: num(g('dchgTotal')),
      chg_total_wh: num(g('chgTotal')),
      fault_code: text('faultCode'),
      fault_name: text('faultName'),
      fault_level: text('faultLevel'),
      snapshot: /^yes$/i.test(String(g('snapshot') || '')) || fill ? 1 : 0,
      balancing,
      hv4: num(g('hv4')),
      hv5: num(g('hv5')),
      signal: num(g('signal')),
    };
    for (const f of FIELDS) store[f].push(row[f]);
  });

  if (!header) throw new Error('The data sheet is empty');
  const n = store.t.length;
  if (!n) throw new Error('No data rows found in the file');

  // Exports list newest first — put samples in time order.
  const order = [...Array(n).keys()].sort((a, b) => (store.t[a] ?? 0) - (store.t[b] ?? 0));
  for (const f of FIELDS) store[f] = order.map((k) => store[f][k]);

  const cellStats = cellAcc.filter((a) => a.cnt).map((a) => ({
    n: a.n, min_mv: a.min, max_mv: a.max, avg_mv: round(a.sum / a.cnt, 1),
    avg_dev_mv: round(a.dev / a.cnt, 1), lowest_pct: round((a.low / a.cnt) * 100, 1), highest_pct: round((a.high / a.cnt) * 100, 1),
  }));
  const tempStats = tempAcc.filter((a) => a.cnt).map((a) => ({
    n: a.n, min_c: a.min, max_c: a.max, avg_c: round(a.sum / a.cnt, 1),
    avg_dev_c: round(a.dev / a.cnt, 2), hottest_pct: round((a.hot / a.cnt) * 100, 1), coldest_pct: round((a.cold / a.cnt) * 100, 1),
  }));

  // Nominal rating from the project name, e.g. "460.8V990Ah-…".
  const projName = String(meta['Proj. Name'] || '');
  const rating = /(\d+(?:\.\d+)?)\s*V\s*(\d+(?:\.\d+)?)\s*Ah/i.exec(projName);

  return {
    meta: {
      hwid: meta.HWID || null,
      project_no: meta['Proj. No.'] || null,
      project_name: projName || null,
      software_version: meta['Software Version'] || null,
      fwid: meta.FWID || null,
      device_model: meta['Device Model'] || null,
      reporting_date: meta['Reporting date'] || null,
      nominal_v: rating ? +rating[1] : null,
      capacity_ah: rating ? +rating[2] : null,
      nominal_kwh: rating ? round((+rating[1] * +rating[2]) / 1000, 1) : null,
      cell_count: cellCols.length,
      temp_sensor_count: tempCols.length,
      columns: header.length,
    },
    data: store,
    cell_stats: cellStats,
    temp_stats: tempStats,
  };
}

// --- stage 2: analyze --------------------------------------------------------------------

function analyzeBmsLog(extracted, savedSettings) {
  const S = mergeSettings(savedSettings);
  const { meta, data: d, cell_stats: cellStats = [], temp_stats: tempStats = [] } = extracted;
  const n = d.t.length;
  const L = S.limits;
  const T = S.thresholds;
  const nominalKwh = L.nominal_kwh || meta.nominal_kwh || null;

  // Sample spacing; gaps longer than this do not count as "charging time".
  const steps = [];
  for (let k = 1; k < n; k++) steps.push((d.t[k] - d.t[k - 1]) / 1000);
  const interval = median(steps) || 32;
  const maxStep = interval * 2.5;
  const dtOf = (k) => (k + 1 < n ? Math.min(Math.max((d.t[k + 1] - d.t[k]) / 1000, 0), maxStep) : interval);

  const kw = d.v.map((v, k) => (v != null && d.i[k] != null ? (v * d.i[k]) / 1000 : null));
  const stateOf = (k) => {
    const i = d.i[k];
    if (i == null || Math.abs(i) < S.events.idle_current_a) return 'idle';
    return i < 0 ? 'discharge' : 'charge';
  };

  // ---- time in each state + energy ----
  const time = { charge: 0, discharge: 0, idle: 0 };
  const energy = { charge: 0, discharge: 0 };
  for (let k = 0; k < n; k++) {
    const st = stateOf(k);
    const dt = dtOf(k);
    time[st] += dt;
    if (st !== 'idle' && kw[k] != null) energy[st] += (Math.abs(kw[k]) * dt) / 3600;
  }

  // ---- gaps ----
  const gaps = [];
  for (let k = 1; k < n; k++) {
    const sec = (d.t[k] - d.t[k - 1]) / 1000;
    if (sec >= T.gap_warn_min * 60) gaps.push({ from: d.t[k - 1], to: d.t[k], minutes: round(sec / 60, 0), soc_before: d.soc[k - 1], soc_after: d.soc[k] });
  }

  // ---- events (charge / discharge sessions) ----
  const raw = [];
  let cur = null;
  for (let k = 0; k < n; k++) {
    const st = stateOf(k);
    if (st === 'idle') { cur = null; continue; }
    if (!cur || cur.type !== st) { cur = { type: st, idx: [] }; raw.push(cur); }
    cur.idx.push(k);
  }
  // Merge same-type segments separated by short pauses into one session.
  const merged = [];
  for (const seg of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === seg.type) {
      const gapMin = (d.t[seg.idx[0]] - d.t[prev.idx[prev.idx.length - 1]]) / 60000;
      if (gapMin <= S.events.merge_gap_min) {
        prev.idx.push(...seg.idx);
        prev.interruptions++;
        continue;
      }
    }
    merged.push({ ...seg, interruptions: 0 });
  }

  const limitA = L.discharge_current_a * (T.current_limit_pct / 100);
  const events = merged.map((ev) => {
    const ix = ev.idx;
    const first = ix[0], last = ix[ix.length - 1];
    let e = 0, active = 0, peakKw = 0, peakA = 0, sumA = 0, atLimit = 0, overSystem = 0;
    for (const k of ix) {
      const dt = dtOf(k);
      active += dt;
      if (kw[k] != null) { e += (Math.abs(kw[k]) * dt) / 3600; peakKw = Math.max(peakKw, Math.abs(kw[k])); }
      if (d.i[k] != null) { peakA = Math.max(peakA, Math.abs(d.i[k])); sumA += Math.abs(d.i[k]); }
      if (ev.type === 'discharge' && d.i[k] != null && Math.abs(d.i[k]) >= limitA) atLimit += dt;
      if (kw[k] != null && Math.abs(kw[k]) > (ev.type === 'discharge' ? L.system_kw : L.charger_kw)) overSystem += dt;
    }
    const pick = (f) => ix.map((k) => d[f][k]).filter((v) => v != null);
    const temps = pick('max_t');
    const tStart = d.max_t[first];
    const tMax = temps.length ? Math.max(...temps) : null;
    const minutes = (d.t[last] - d.t[first]) / 60000 + interval / 60;

    const out = {
      type: ev.type,
      start: d.t[first],
      end: d.t[last] + interval * 1000,
      start_local: d.device_time[first],
      end_local: d.device_time[last],
      duration_min: round(minutes, 1),
      active_min: round(active / 60, 1),
      energy_kwh: round(e, 1),
      avg_kw: active ? round(e / (active / 3600), 1) : null,
      peak_kw: round(peakKw, 1),
      avg_a: round(sumA / ix.length, 0),
      peak_a: round(peakA, 1),
      soc_start: d.soc[first],
      soc_end: d.soc[last],
      temp_start_c: tStart,
      temp_max_c: tMax,
      temp_rise_c: tStart != null && tMax != null ? round(tMax - tStart, 1) : null,
      temp_rise_c_per_min: tStart != null && tMax != null && minutes > 0 ? round((tMax - tStart) / minutes, 2) : null,
      max_cell_spread_v: Math.max(...pick('cell_spread_v'), 0) || null,
      min_cell_v: pick('min_cell_v').length ? Math.min(...pick('min_cell_v')) : null,
      max_cell_v: pick('max_cell_v').length ? Math.max(...pick('max_cell_v')) : null,
      interruptions: ev.interruptions,
      minutes_at_current_limit: ev.type === 'discharge' ? round(atLimit / 60, 1) : null,
      minutes_over_power_limit: round(overSystem / 60, 1),
    };
    if (ev.type === 'charge') {
      out.requested_v = mode(pick('chg_req_v'));
      const reqA = pick('chg_req_a');
      out.requested_a = reqA.length ? Math.max(...reqA) : null;
      out.charger_out_peak_a = pick('chg_out_a').length ? Math.max(...pick('chg_out_a')) : null;
      // How much of the requested current actually flowed, while a request was active.
      let reqSum = 0, gotSum = 0;
      for (const k of ix) if (d.chg_req_a[k] > 0 && d.i[k] != null) { reqSum += d.chg_req_a[k]; gotSum += d.i[k]; }
      out.delivered_vs_requested_pct = reqSum ? round((gotSum / reqSum) * 100, 0) : null;
      out.connection = mode(pick('chg_conn'));
    } else {
      out.vehicle_sessions_est = L.vehicle_session_kwh ? round(e / L.vehicle_session_kwh, 1) : null;
    }
    return out;
  }).filter((ev) => ev.energy_kwh >= S.events.min_event_kwh);

  const dEvents = events.filter((e) => e.type === 'discharge');
  const cEvents = events.filter((e) => e.type === 'charge');

  // ---- temperature vs power (derating) ----
  const bands = [[-Infinity, 25], [25, 30], [30, 35], [35, 40], [40, 45], [45, 50], [50, Infinity]];
  const derating = ['discharge', 'charge'].map((type) => ({
    type,
    bands: bands.map(([lo, hi]) => {
      const ks = [];
      for (let k = 0; k < n; k++) if (stateOf(k) === type && d.max_t[k] != null && d.max_t[k] >= lo && d.max_t[k] < hi && kw[k] != null) ks.push(k);
      return {
        label: lo === -Infinity ? `< ${hi}°C` : hi === Infinity ? `≥ ${lo}°C` : `${lo}–${hi}°C`,
        samples: ks.length,
        avg_kw: ks.length ? round(ks.reduce((a, k) => a + Math.abs(kw[k]), 0) / ks.length, 1) : null,
        avg_a: ks.length ? round(ks.reduce((a, k) => a + Math.abs(d.i[k]), 0) / ks.length, 0) : null,
      };
    }).filter((b) => b.samples > 0),
  }));

  // ---- extremes ----
  function extreme(field, fn) {
    let best = null;
    for (let k = 0; k < n; k++) {
      const v = d[field][k];
      if (v == null) continue;
      if (best == null || fn(v, d[field][best])) best = k;
    }
    return best;
  }
  const kMaxT = extreme('max_t', (a, b) => a > b);
  const kMinT = extreme('min_t', (a, b) => a < b);
  const kSpread = extreme('cell_spread_v', (a, b) => a > b);
  const kMaxCell = extreme('max_cell_v', (a, b) => a > b);
  const kMinCell = extreme('min_cell_v', (a, b) => a < b);
  const kInsul = extreme('insul_kohm', (a, b) => a < b);
  const kSupply = extreme('supply_v', (a, b) => a < b);
  let kTempSpread = null;
  for (let k = 0; k < n; k++) {
    if (d.max_t[k] == null || d.min_t[k] == null) continue;
    if (kTempSpread == null || d.max_t[k] - d.min_t[k] > d.max_t[kTempSpread] - d.min_t[kTempSpread]) kTempSpread = k;
  }
  const at = (k, extra = {}) => (k == null ? null : { t: d.t[k], soc: d.soc[k], state: stateOf(k), ...extra });

  const socs = d.soc.filter((v) => v != null);
  const sohs = d.soh.filter((v) => v != null);
  const firstNonNull = (f) => d[f].find((v) => v != null) ?? null;
  const lastNonNull = (f) => [...d[f]].reverse().find((v) => v != null) ?? null;

  // ---- lifetime counters ----
  const dchgFirst = firstNonNull('dchg_total_wh'), dchgLast = lastNonNull('dchg_total_wh');
  const chgFirst = firstNonNull('chg_total_wh'), chgLast = lastNonNull('chg_total_wh');
  const counters = {
    lifetime_discharge_kwh: dchgLast != null ? round(dchgLast / 1000, 0) : null,
    lifetime_charge_kwh: chgLast != null ? round(chgLast / 1000, 0) : null,
    period_discharge_kwh: dchgFirst != null && dchgLast != null ? round((dchgLast - dchgFirst) / 1000, 1) : null,
    period_charge_kwh: chgFirst != null && chgLast != null ? round((chgLast - chgFirst) / 1000, 1) : null,
    equivalent_full_cycles: dchgLast != null && nominalKwh ? round(dchgLast / 1000 / nominalKwh, 0) : null,
  };

  // ---- insulation (Ω per volt) ----
  const insulOhmPerV = kInsul != null && d.v[kInsul] ? round((d.insul_kohm[kInsul] * 1000) / d.v[kInsul], 0) : null;

  // ---- faults & snapshots ----
  const faults = [];
  const seenFault = new Set();
  for (let k = 0; k < n; k++) {
    if (d.fault_code[k] || d.fault_name[k] || d.chg_fault[k]) {
      const key = `${d.fault_code[k]}|${d.fault_name[k]}|${d.chg_fault[k]}`;
      const last = faults.find((f) => f.key === key);
      if (last && d.t[k] - last.last_t <= maxStep * 1000 * 2) { last.last_t = d.t[k]; last.samples++; continue; }
      faults.push({ key, code: d.fault_code[k], name: d.fault_name[k] || (d.chg_fault[k] ? `Charger fault ${d.chg_fault[k]}` : null), level: d.fault_level[k], first_t: d.t[k], last_t: d.t[k], samples: 1, soc: d.soc[k] });
      seenFault.add(key);
    }
  }
  const snapshotRows = d.snapshot.reduce((a, v) => a + (v ? 1 : 0), 0);

  // ---- cell & sensor outliers ----
  const weakCells = [...cellStats].sort((a, b) => a.avg_dev_mv - b.avg_dev_mv).slice(0, 8);
  const strongCells = [...cellStats].sort((a, b) => b.avg_dev_mv - a.avg_dev_mv).slice(0, 5);
  const hotSensors = [...tempStats].sort((a, b) => b.avg_dev_c - a.avg_dev_c).slice(0, 8);
  const balancingSamples = d.balancing.filter((b) => b > 0).length;

  // ---- warnings ----
  const warnings = [];
  const warn = (level, key, message, detail = {}) => warnings.push({ level, key, message, ...detail });
  const fmtT = (k) => (k == null ? '' : ` at ${d.device_time[k]} (SOC ${d.soc[k]}%, ${stateOf(k)})`);

  if (kMaxT != null) {
    const v = d.max_t[kMaxT];
    if (v >= T.temp_crit_c) warn('critical', 'temp_high', `Cell temperature reached ${v}°C (critical ≥ ${T.temp_crit_c}°C)${fmtT(kMaxT)}`, { t: d.t[kMaxT] });
    else if (v >= T.temp_warn_c) warn('warning', 'temp_high', `Cell temperature reached ${v}°C (warning ≥ ${T.temp_warn_c}°C)${fmtT(kMaxT)}`, { t: d.t[kMaxT] });
  }
  if (kTempSpread != null) {
    const v = d.max_t[kTempSpread] - d.min_t[kTempSpread];
    if (v >= T.temp_spread_warn_c) warn('warning', 'temp_spread', `${v}°C difference between hottest and coolest sensor (warning ≥ ${T.temp_spread_warn_c}°C)${fmtT(kTempSpread)}`, { t: d.t[kTempSpread] });
  }
  for (const ev of events) {
    if (ev.temp_rise_c_per_min != null && ev.temp_rise_c_per_min >= T.temp_rise_warn_c_per_min) {
      warn('warning', 'temp_rise', `Temperature rose ${ev.temp_rise_c}°C in ${ev.duration_min} min during ${ev.type} (${ev.temp_rise_c_per_min}°C/min)`, { t: ev.start });
    }
  }
  if (kSpread != null) {
    const v = d.cell_spread_v[kSpread];
    const lvl = v >= T.cell_spread_crit_v ? 'critical' : v >= T.cell_spread_warn_v ? 'warning' : null;
    if (lvl) {
      const topOfCharge = d.soc[kSpread] >= 95 ? ' Near full charge, where LFP cell voltages naturally separate — check that balancing brings it back down.' : '';
      warn(lvl, 'cell_spread', `Cell voltage spread reached ${round(v * 1000, 0)} mV${fmtT(kSpread)}.${topOfCharge}`, { t: d.t[kSpread] });
    }
  }
  if (kMaxCell != null) {
    const v = d.max_cell_v[kMaxCell];
    if (v >= T.cell_high_crit_v) warn('critical', 'cell_high', `Cell #${d.max_cell_id[kMaxCell]} reached ${v} V (critical ≥ ${T.cell_high_crit_v} V)${fmtT(kMaxCell)}`, { t: d.t[kMaxCell] });
    else if (v >= T.cell_high_warn_v) warn('warning', 'cell_high', `Cell #${d.max_cell_id[kMaxCell]} reached ${v} V (warning ≥ ${T.cell_high_warn_v} V)${fmtT(kMaxCell)}`, { t: d.t[kMaxCell] });
  }
  if (kMinCell != null) {
    const v = d.min_cell_v[kMinCell];
    if (v <= T.cell_low_crit_v) warn('critical', 'cell_low', `Cell #${d.min_cell_id[kMinCell]} dropped to ${v} V (critical ≤ ${T.cell_low_crit_v} V)${fmtT(kMinCell)}`, { t: d.t[kMinCell] });
    else if (v <= T.cell_low_warn_v) warn('warning', 'cell_low', `Cell #${d.min_cell_id[kMinCell]} dropped to ${v} V (warning ≤ ${T.cell_low_warn_v} V)${fmtT(kMinCell)}`, { t: d.t[kMinCell] });
  }
  const weakest = weakCells[0];
  if (weakest && weakest.lowest_pct >= 40 && weakest.avg_dev_mv <= -15) {
    warn('info', 'weak_cell', `Cell #${weakest.n} is the lowest cell in ${weakest.lowest_pct}% of readings, averaging ${Math.abs(weakest.avg_dev_mv)} mV below the pack average. Watch it across reports.`);
  }
  const hottest = hotSensors[0];
  if (hottest && hottest.hottest_pct >= 25 && hottest.avg_dev_c >= 3) {
    warn('info', 'hot_spot', `Temperature sensor #${hottest.n} is the hottest in ${hottest.hottest_pct}% of readings, ${hottest.avg_dev_c}°C above average — possible cooling hot spot.`);
  }
  for (const ev of dEvents) {
    if (ev.minutes_at_current_limit >= 1) warn('info', 'current_limit', `Discharge ran at the ${L.discharge_current_a} A current limit for ${ev.minutes_at_current_limit} min (peak ${ev.peak_a} A, ${ev.peak_kw} kW).`, { t: ev.start });
    if (ev.minutes_over_power_limit >= 1) warn('warning', 'over_power', `Discharge was above the ${L.system_kw} kW system rating for ${ev.minutes_over_power_limit} min (peak ${ev.peak_kw} kW).`, { t: ev.start });
  }
  for (const ev of cEvents) {
    if (ev.interruptions >= T.interruptions_warn) warn('warning', 'charge_interrupted', `Charging session starting ${ev.start_local} stopped and restarted ${ev.interruptions} times. Check the charger / OCPP logs for that window.`, { t: ev.start });
    if (ev.delivered_vs_requested_pct != null && ev.delivered_vs_requested_pct < T.charger_shortfall_pct) warn('info', 'charger_shortfall', `Charger delivered ${ev.delivered_vs_requested_pct}% of the current the BMS requested (requested up to ${ev.requested_a} A, got peak ${ev.peak_a} A).`, { t: ev.start });
    if (ev.minutes_over_power_limit >= 1) warn('warning', 'over_power', `Charging above the ${L.charger_kw} kW charger rating for ${ev.minutes_over_power_limit} min.`, { t: ev.start });
  }
  if (insulOhmPerV != null) {
    if (insulOhmPerV < T.insulation_crit_ohm_per_v) warn('critical', 'insulation', `Insulation resistance dropped to ${d.insul_kohm[kInsul]} kΩ (${insulOhmPerV} Ω/V, critical < ${T.insulation_crit_ohm_per_v} Ω/V)${fmtT(kInsul)}`, { t: d.t[kInsul] });
    else if (insulOhmPerV < T.insulation_warn_ohm_per_v) warn('warning', 'insulation', `Insulation resistance dropped to ${d.insul_kohm[kInsul]} kΩ (${insulOhmPerV} Ω/V, warning < ${T.insulation_warn_ohm_per_v} Ω/V)${fmtT(kInsul)}`, { t: d.t[kInsul] });
  }
  if (kSupply != null && d.supply_v[kSupply] < T.supply_low_v) warn('warning', 'supply_low', `12 V supply dropped to ${round(d.supply_v[kSupply], 2)} V${fmtT(kSupply)}`, { t: d.t[kSupply] });
  const sohNow = sohs.length ? sohs[sohs.length - 1] : null;
  if (sohNow != null && sohNow < T.soh_warn_pct) warn('warning', 'soh', `State of health is ${sohNow}% (warning < ${T.soh_warn_pct}%)`);
  if (socs.length && Math.min(...socs) <= T.soc_low_warn_pct) warn('warning', 'soc_low', `SOC dropped to ${Math.min(...socs)}% (warning ≤ ${T.soc_low_warn_pct}%)`);
  for (const f of faults) warn(/3|high|severe|critical/i.test(f.level || '') ? 'critical' : 'warning', 'fault', `Fault: ${f.name || f.code}${f.level ? ` (level ${f.level})` : ''} — ${f.samples} reading${f.samples === 1 ? '' : 's'}`, { t: f.first_t });
  if (snapshotRows) warn('warning', 'snapshot', `${snapshotRows} fault snapshot reading${snapshotRows === 1 ? '' : 's'} in this file (the BMS records these around a fault).`);
  for (const g of gaps) warn('info', 'gap', `No data for ${g.minutes} min (SOC ${g.soc_before}% → ${g.soc_after}%). The battery was offline or not reporting.`, { t: g.from });

  const order = { critical: 0, warning: 1, info: 2 };
  warnings.sort((a, b) => order[a.level] - order[b.level] || (a.t || 0) - (b.t || 0));

  // ---- chart series (downsampled) ----
  const MAX_POINTS = 1500;
  const step = Math.max(1, Math.ceil(n / MAX_POINTS));
  const series = [];
  for (let k = 0; k < n; k += step) {
    // Keep the extreme power reading in each bucket so peaks are not lost.
    let pick = k;
    for (let j = k; j < Math.min(n, k + step); j++) if (kw[j] != null && Math.abs(kw[j]) > Math.abs(kw[pick] ?? 0)) pick = j;
    // A gap in the log: insert an empty point so charts break the line
    // instead of drawing a straight line across hours with no data.
    const prevT = series.length ? series[series.length - 1].t : null;
    if (prevT != null && d.t[pick] - prevT > maxStep * 1000 * step) series.push({ t: prevT + 1000, gap: 1 });
    series.push({
      t: d.t[pick], soc: d.soc[pick], kw: round(kw[pick], 1), a: d.i[pick],
      max_t: d.max_t[pick], min_t: d.min_t[pick], avg_t: d.avg_t[pick],
      max_cell_v: d.max_cell_v[pick], min_cell_v: d.min_cell_v[pick], spread_mv: d.cell_spread_v[pick] != null ? round(d.cell_spread_v[pick] * 1000, 0) : null,
      insul_kohm: d.insul_kohm[pick],
    });
  }

  const summary = {
    start: d.t[0],
    end: d.t[n - 1],
    hours: round((d.t[n - 1] - d.t[0]) / 3600000, 1),
    samples: n,
    interval_s: round(interval, 0),
    soh: sohNow,
    soc_start: firstNonNull('soc'),
    soc_end: lastNonNull('soc'),
    soc_min: socs.length ? Math.min(...socs) : null,
    soc_max: socs.length ? Math.max(...socs) : null,
    nominal_kwh: nominalKwh,
    discharge_kwh: round(energy.discharge, 1),
    charge_kwh: round(energy.charge, 1),
    discharge_hours: round(time.discharge / 3600, 2),
    charge_hours: round(time.charge / 3600, 2),
    idle_hours: round(time.idle / 3600, 2),
    discharge_sessions: dEvents.length,
    charge_sessions: cEvents.length,
    peak_discharge_kw: dEvents.length ? Math.max(...dEvents.map((e) => e.peak_kw)) : null,
    peak_charge_kw: cEvents.length ? Math.max(...cEvents.map((e) => e.peak_kw)) : null,
    avg_discharge_kw: time.discharge ? round(energy.discharge / (time.discharge / 3600), 1) : null,
    avg_charge_kw: time.charge ? round(energy.charge / (time.charge / 3600), 1) : null,
    peak_discharge_a: dEvents.length ? Math.max(...dEvents.map((e) => e.peak_a)) : null,
    peak_charge_a: cEvents.length ? Math.max(...cEvents.map((e) => e.peak_a)) : null,
    max_temp_c: kMaxT != null ? d.max_t[kMaxT] : null,
    min_temp_c: kMinT != null ? d.min_t[kMinT] : null,
    max_temp_spread_c: kTempSpread != null ? d.max_t[kTempSpread] - d.min_t[kTempSpread] : null,
    max_cell_v: kMaxCell != null ? d.max_cell_v[kMaxCell] : null,
    min_cell_v: kMinCell != null ? d.min_cell_v[kMinCell] : null,
    max_cell_spread_mv: kSpread != null ? round(d.cell_spread_v[kSpread] * 1000, 0) : null,
    min_insulation_kohm: kInsul != null ? d.insul_kohm[kInsul] : null,
    min_insulation_ohm_per_v: insulOhmPerV,
    min_supply_v: kSupply != null ? round(d.supply_v[kSupply], 2) : null,
    weakest_cell: weakest ? weakest.n : null,
    hottest_sensor: hottest ? hottest.n : null,
    vehicle_sessions_est: L.vehicle_session_kwh ? round(energy.discharge / L.vehicle_session_kwh, 1) : null,
    faults: faults.length,
    snapshot_rows: snapshotRows,
    gaps: gaps.length,
    warnings: { critical: warnings.filter((w) => w.level === 'critical').length, warning: warnings.filter((w) => w.level === 'warning').length, info: warnings.filter((w) => w.level === 'info').length },
    ...counters,
  };

  return {
    settings: S,
    meta: { ...meta, nominal_kwh: nominalKwh },
    summary,
    warnings,
    events,
    derating,
    extremes: {
      max_temp: at(kMaxT, { value: d.max_t[kMaxT], sensor: d.max_t_id[kMaxT] }),
      min_temp: at(kMinT, { value: d.min_t[kMinT], sensor: d.min_t_id[kMinT] }),
      max_cell: at(kMaxCell, { value: d.max_cell_v[kMaxCell], cell: d.max_cell_id[kMaxCell] }),
      min_cell: at(kMinCell, { value: d.min_cell_v[kMinCell], cell: d.min_cell_id[kMinCell] }),
      max_spread: at(kSpread, { value_mv: kSpread != null ? round(d.cell_spread_v[kSpread] * 1000, 0) : null }),
      min_insulation: at(kInsul, { value_kohm: kInsul != null ? d.insul_kohm[kInsul] : null, ohm_per_v: insulOhmPerV }),
    },
    cells: {
      count: meta.cell_count,
      weakest: weakCells,
      strongest: strongCells,
      balancing_samples: balancingSamples,
      balancing_pct: n ? round((balancingSamples / n) * 100, 1) : 0,
      all: cellStats,
    },
    temps: { count: meta.temp_sensor_count, hottest: hotSensors, all: tempStats },
    gaps,
    faults: faults.map(({ key, ...f }) => f),
    series,
  };
}

module.exports = { extractBmsLog, analyzeBmsLog, mergeSettings, DEFAULT_SETTINGS };
