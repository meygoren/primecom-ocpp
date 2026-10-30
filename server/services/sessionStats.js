const supabase = require('../db/supabase');

// Session statistics + battery system detection.
//
// Every charging session gets a running summary on its `sessions` row:
// energy (via meter_start_wh / meter_stop_wh), average / peak / lowest kW,
// start and end SoC, and which battery system was being charged (Primecom or
// SETEC). The summary is updated live from MeterValues while the session is
// charging, then recomputed from the full meter_values history when the
// session stops. That way the numbers survive even if StopTransaction is
// lost, and they outlive the 60-day meter_values retention.

const POWER = 'Power.Active.Import';
const ENERGY = 'Energy.Active.Import.Register';
const SOC = 'SoC';

// Power readings below this are the charger idling (car full, ramp up/down),
// not charging — they are left out of the average and the lowest-kW figure.
const MIN_CHARGING_KW = 0.5;

// --- Unit helpers ---------------------------------------------------------

function toKw(value, unit) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return null;
  if (unit === 'W') return v / 1000;
  if (unit === 'kW') return v;
  // No unit given. Matches liveData.js (treat as kW), but a number this large
  // can only be watts.
  return v > 1000 ? v / 1000 : v;
}

function toWh(value, unit) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return null;
  return unit === 'kWh' ? v * 1000 : v; // OCPP default energy unit is Wh
}

function round(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

// A battery MAC arrives as the idTag when the charger uses Autocharge.
// "AA:BB:CC:DD:EE:FF", "aa-bb-cc-dd-ee-ff" and "AABBCCDDEEFF" are all the same.
function normalizeMac(tag) {
  return String(tag || '').trim().toUpperCase().replace(/[\s:.-]/g, '');
}

function looksLikeMac(tag) {
  return /^[0-9A-F]{12}$/.test(normalizeMac(tag));
}

// --- Battery systems ------------------------------------------------------

let _systemsCache = null;
let _systemsCachedAt = 0;

async function getBatterySystems() {
  if (_systemsCache && Date.now() - _systemsCachedAt < 60 * 1000) return _systemsCache;
  const { data, error } = await supabase.from('battery_systems').select('*').order('sort_order');
  if (error) {
    console.error('[SessionStats] Could not load battery_systems:', error.message);
    return _systemsCache || [];
  }
  _systemsCache = data || [];
  _systemsCachedAt = Date.now();
  return _systemsCache;
}

function clearBatterySystemsCache() {
  _systemsCache = null;
}

// Decides which battery system a session was charging. Checked in order:
//   1. The charger is pinned to a system on its detail page        → 'charger'
//   2. The idTag matches a battery MAC configured for a system     → 'mac'
//   3. SoC moved at least 10 points: energy / SoC change ≈ pack size → 'capacity'
//   4. More energy went in than the smaller pack can hold          → 'energy'
// Otherwise unknown. A manual override on the session ('manual') always wins
// and is never replaced here.
function inferBatterySystem({ chargerSetting, mac, energyKwh, startSoc, endSoc }, systems) {
  if (!systems?.length) return { system: null, source: null, estCapacity: null };

  if (chargerSetting && chargerSetting !== 'auto' && systems.some((s) => s.id === chargerSetting)) {
    return { system: chargerSetting, source: 'charger', estCapacity: null };
  }

  if (mac && looksLikeMac(mac)) {
    const wanted = normalizeMac(mac);
    const match = systems.find((s) => (s.mac_addresses || []).some((m) => normalizeMac(m) === wanted));
    if (match) return { system: match.id, source: 'mac', estCapacity: null };
  }

  let estCapacity = null;
  if (energyKwh > 0 && startSoc != null && endSoc != null && endSoc - startSoc >= 10) {
    estCapacity = energyKwh / ((endSoc - startSoc) / 100);
    let best = null;
    for (const s of systems) {
      const diff = Math.abs(parseFloat(s.capacity_kwh) - estCapacity);
      if (!best || diff < best.diff) best = { id: s.id, diff };
    }
    return { system: best.id, source: 'capacity', estCapacity: round(estCapacity, 1) };
  }

  if (energyKwh > 0) {
    const bySize = [...systems].sort((a, b) => parseFloat(a.capacity_kwh) - parseFloat(b.capacity_kwh));
    // Find the smallest pack that could have absorbed this much energy. Only
    // conclusive when it rules out every smaller pack (5% margin for losses).
    for (let i = 1; i < bySize.length; i++) {
      if (energyKwh > parseFloat(bySize[i - 1].capacity_kwh) * 1.05) {
        if (i === bySize.length - 1 || energyKwh <= parseFloat(bySize[i].capacity_kwh) * 1.05) {
          return { system: bySize[i].id, source: 'energy', estCapacity: null };
        }
      }
    }
  }

  return { system: null, source: null, estCapacity: null };
}

// --- Summarising a list of meter samples ----------------------------------

// samples: [{ timestamp, measurand, value, unit }]
// Returns live/final stats for one transaction.
function summarizeSamples(samples) {
  const powerByTs = new Map();
  const energy = [];
  const soc = [];

  for (const s of samples) {
    if (s.measurand === POWER) {
      const kw = toKw(s.value, s.unit);
      if (kw == null) continue;
      // Chargers that report per-phase values send several rows per
      // timestamp; keep the largest (the total, when one is sent).
      const prev = powerByTs.get(s.timestamp);
      if (prev == null || kw > prev) powerByTs.set(s.timestamp, kw);
    } else if (s.measurand === ENERGY) {
      const wh = toWh(s.value, s.unit);
      if (wh != null) energy.push({ t: new Date(s.timestamp).getTime(), wh });
    } else if (s.measurand === SOC) {
      const v = parseFloat(s.value);
      if (Number.isFinite(v)) soc.push({ t: new Date(s.timestamp).getTime(), v });
    }
  }

  energy.sort((a, b) => a.t - b.t);
  soc.sort((a, b) => a.t - b.t);

  let power = [...powerByTs.entries()]
    .map(([ts, kw]) => ({ t: new Date(ts).getTime(), kw }))
    .sort((a, b) => a.t - b.t);

  // Some DC chargers only report the energy register. Derive kW from the
  // change in energy between readings.
  if (power.length === 0 && energy.length > 1) {
    power = [];
    for (let i = 1; i < energy.length; i++) {
      const hours = (energy[i].t - energy[i - 1].t) / 3600000;
      if (hours <= 0) continue;
      power.push({ t: energy[i].t, kw: (energy[i].wh - energy[i - 1].wh) / 1000 / hours });
    }
  }

  const charging = power.filter((p) => p.kw >= MIN_CHARGING_KW);
  const sum = charging.reduce((acc, p) => acc + p.kw, 0);

  return {
    power,
    energy,
    soc,
    latestPowerKw: power.length ? power[power.length - 1].kw : null,
    maxPowerKw: charging.length ? Math.max(...charging.map((p) => p.kw)) : null,
    minPowerKw: charging.length ? Math.min(...charging.map((p) => p.kw)) : null,
    avgPowerKw: charging.length ? sum / charging.length : null,
    sampleCount: charging.length,
    firstEnergyWh: energy.length ? energy[0].wh : null,
    lastEnergyWh: energy.length ? energy[energy.length - 1].wh : null,
    startSoc: soc.length ? soc[0].v : null,
    endSoc: soc.length ? soc[soc.length - 1].v : null,
  };
}

// Energy delivered in kWh from meter readings. Prefers the StartTransaction /
// StopTransaction meter values; falls back to the change in the energy
// register across the session.
function energyFromMeters(meterStartWh, meterStopWh, firstEnergyWh) {
  const start = meterStartWh != null ? parseFloat(meterStartWh) : firstEnergyWh;
  const stop = meterStopWh != null ? parseFloat(meterStopWh) : null;
  if (start == null || stop == null || !Number.isFinite(start) || !Number.isFinite(stop)) return null;
  if (stop < start) return null; // meter reset mid-session — cannot trust it
  return (stop - start) / 1000;
}

// --- Fetching samples for a transaction -----------------------------------

async function fetchTransactionSamples(session, { limit = 20000 } = {}) {
  const pageSize = 1000;
  const all = [];

  // Transaction IDs are small sequential numbers and the counter has been
  // reseeded before, so bound the lookup by the session's own time window.
  const from = session.start_time
    ? new Date(new Date(session.start_time).getTime() - 60 * 1000).toISOString()
    : null;
  const to = session.stop_time
    ? new Date(new Date(session.stop_time).getTime() + 5 * 60 * 1000).toISOString()
    : null;

  for (let offset = 0; offset < limit; offset += pageSize) {
    let q = supabase
      .from('meter_values')
      .select('timestamp, measurand, value, unit')
      .eq('charger_id', session.charger_id)
      .eq('transaction_id', session.transaction_id)
      .in('measurand', [POWER, ENERGY, SOC])
      .order('timestamp', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (from) q = q.gte('timestamp', from);
    if (to) q = q.lte('timestamp', to);

    const { data, error } = await q;
    if (error) {
      console.error(`[SessionStats] meter_values fetch failed for tx ${session.transaction_id}:`, error.message);
      break;
    }
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

// --- Live updates from MeterValues ----------------------------------------

// In-memory running stats per transaction so each MeterValues message costs
// one UPDATE instead of a re-read of the whole history.
// Key: `${chargerId}:${transactionId}`
const running = new Map();

async function loadRunning(chargerId, transactionId) {
  const key = `${chargerId}:${transactionId}`;
  if (running.has(key)) return running.get(key);

  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, charger_id, id_tag, battery_mac, battery_system, battery_system_source, meter_start_wh, start_soc, end_soc, max_power_kw, min_power_kw, avg_power_kw, power_sample_count')
    .eq('charger_id', chargerId)
    .eq('transaction_id', transactionId)
    .is('stop_time', null)
    .maybeSingle();

  if (error || !session) return null;

  const state = {
    sessionId: session.id,
    idTag: session.id_tag,
    batteryMac: session.battery_mac,
    batterySystem: session.battery_system,
    batterySource: session.battery_system_source,
    meterStartWh: session.meter_start_wh != null ? parseFloat(session.meter_start_wh) : null,
    startSoc: session.start_soc != null ? parseFloat(session.start_soc) : null,
    endSoc: session.end_soc != null ? parseFloat(session.end_soc) : null,
    maxKw: session.max_power_kw != null ? parseFloat(session.max_power_kw) : null,
    minKw: session.min_power_kw != null ? parseFloat(session.min_power_kw) : null,
    avgKw: session.avg_power_kw != null ? parseFloat(session.avg_power_kw) : null,
    count: session.power_sample_count || 0,
    lastEnergyWh: null,
    firstEnergyWh: null,
  };
  running.set(key, state);
  return state;
}

// Called (fire-and-forget) from the MeterValues handler with the rows it just
// inserted into meter_values.
async function updateRunningStats(chargerId, transactionId, rows) {
  if (!transactionId || !rows?.length) return;

  const state = await loadRunning(chargerId, transactionId);
  if (!state) return;

  const s = summarizeSamples(rows);

  for (const p of s.power) {
    if (p.kw < MIN_CHARGING_KW) continue;
    state.maxKw = state.maxKw == null ? p.kw : Math.max(state.maxKw, p.kw);
    state.minKw = state.minKw == null ? p.kw : Math.min(state.minKw, p.kw);
    state.avgKw = state.avgKw == null ? p.kw : (state.avgKw * state.count + p.kw) / (state.count + 1);
    state.count += 1;
  }
  if (s.startSoc != null && state.startSoc == null) state.startSoc = s.startSoc;
  if (s.endSoc != null) state.endSoc = s.endSoc;
  if (s.firstEnergyWh != null && state.firstEnergyWh == null) state.firstEnergyWh = s.firstEnergyWh;
  if (s.lastEnergyWh != null) state.lastEnergyWh = s.lastEnergyWh;

  const update = {
    max_power_kw: round(state.maxKw),
    min_power_kw: round(state.minKw),
    avg_power_kw: round(state.avgKw),
    power_sample_count: state.count,
    start_soc: round(state.startSoc, 1),
    end_soc: round(state.endSoc, 1),
  };
  if (state.lastEnergyWh != null) update.meter_stop_wh = state.lastEnergyWh;

  // Re-detect the battery system while charging (SoC-based estimate improves
  // as the session goes on). Never touch a manual override.
  if (state.batterySource !== 'manual' && state.batterySource !== 'charger' && state.batterySource !== 'mac') {
    const systems = await getBatterySystems();
    const energyKwh = energyFromMeters(state.meterStartWh, state.lastEnergyWh, state.firstEnergyWh);
    const inferred = inferBatterySystem(
      { mac: state.batteryMac || state.idTag, energyKwh, startSoc: state.startSoc, endSoc: state.endSoc },
      systems
    );
    if (inferred.system) {
      state.batterySystem = inferred.system;
      state.batterySource = inferred.source;
      update.battery_system = inferred.system;
      update.battery_system_source = inferred.source;
      update.est_capacity_kwh = inferred.estCapacity;
    }
  }

  const { error } = await supabase.from('sessions').update(update).eq('id', state.sessionId);
  if (error) {
    console.error(`[SessionStats] Live update failed for ${chargerId} tx ${transactionId}:`, error.message);
  }
}

// --- Session start / stop -------------------------------------------------

// Called after the StartTransaction session row is inserted. Stores the meter
// start reading, the battery MAC and a first guess at the battery system.
// Separate from the insert so a database without the new columns (migration
// not yet run) still records the session itself.
async function recordSessionStart(chargerId, transactionId, { meterStart, idTag }) {
  const update = {};
  if (meterStart != null && Number.isFinite(parseFloat(meterStart))) update.meter_start_wh = parseFloat(meterStart);
  if (idTag && looksLikeMac(idTag)) update.battery_mac = normalizeMac(idTag);

  const [{ data: charger }, systems] = await Promise.all([
    supabase.from('chargers').select('battery_system').eq('charger_id', chargerId).maybeSingle(),
    getBatterySystems(),
  ]);
  const inferred = inferBatterySystem({ chargerSetting: charger?.battery_system, mac: idTag }, systems);
  if (inferred.system) {
    update.battery_system = inferred.system;
    update.battery_system_source = inferred.source;
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from('sessions')
    .update(update)
    .eq('charger_id', chargerId)
    .eq('transaction_id', transactionId)
    .is('stop_time', null);

  if (error) {
    console.error(
      `[SessionStats] Could not save start details for ${chargerId} tx ${transactionId}:`,
      error.message,
      '(has supabase_migration_locations.sql been run?)'
    );
  }
}

// Recomputes the full summary for one session from its meter_values history
// and writes it to the session row. Used on StopTransaction and by the
// "Recalculate" button for past sessions. Never rewrites energy_kwh — that is
// the billing figure and is set by the StopTransaction handler.
async function finalizeSession(session) {
  const [samples, systems, chargerRes] = await Promise.all([
    fetchTransactionSamples(session),
    getBatterySystems(),
    supabase.from('chargers').select('battery_system').eq('charger_id', session.charger_id).maybeSingle(),
  ]);

  running.delete(`${session.charger_id}:${session.transaction_id}`);

  const s = summarizeSamples(samples);

  // Meter readings: StopTransaction's meterStop is authoritative; otherwise
  // the last energy register reading seen during the session.
  const meterStopWh = session.meter_stop_wh != null ? parseFloat(session.meter_stop_wh) : s.lastEnergyWh;
  const meterStartWh = session.meter_start_wh != null ? parseFloat(session.meter_start_wh) : s.firstEnergyWh;
  let energyKwh = energyFromMeters(meterStartWh, meterStopWh, s.firstEnergyWh);
  if (energyKwh == null && session.energy_kwh != null) energyKwh = parseFloat(session.energy_kwh);

  // If no power samples at all, fall back to energy / duration.
  let avg = s.avgPowerKw;
  if (avg == null && energyKwh && session.start_time && session.stop_time) {
    const hours = (new Date(session.stop_time) - new Date(session.start_time)) / 3600000;
    if (hours > 0) avg = energyKwh / hours;
  }

  const startSoc = s.startSoc ?? (session.start_soc != null ? parseFloat(session.start_soc) : null);
  const endSoc = s.endSoc ?? (session.end_soc != null ? parseFloat(session.end_soc) : null);

  const update = {
    max_power_kw: round(s.maxPowerKw ?? (session.max_power_kw != null ? parseFloat(session.max_power_kw) : null)),
    min_power_kw: round(s.minPowerKw ?? (session.min_power_kw != null ? parseFloat(session.min_power_kw) : null)),
    avg_power_kw: round(avg ?? (session.avg_power_kw != null ? parseFloat(session.avg_power_kw) : null)),
    power_sample_count: s.sampleCount || session.power_sample_count || 0,
    start_soc: round(startSoc, 1),
    end_soc: round(endSoc, 1),
  };
  if (meterStartWh != null && session.meter_start_wh == null) update.meter_start_wh = meterStartWh;
  if (meterStopWh != null) update.meter_stop_wh = meterStopWh;

  const mac = session.battery_mac || (looksLikeMac(session.id_tag) ? normalizeMac(session.id_tag) : null);
  if (mac && !session.battery_mac) update.battery_mac = mac;

  if (session.battery_system_source !== 'manual') {
    const inferred = inferBatterySystem(
      { chargerSetting: chargerRes.data?.battery_system, mac, energyKwh, startSoc, endSoc },
      systems
    );
    update.battery_system = inferred.system;
    update.battery_system_source = inferred.source;
    update.est_capacity_kwh = inferred.estCapacity;
  }

  const { error } = await supabase.from('sessions').update(update).eq('id', session.id);
  if (error) {
    console.error(`[SessionStats] Finalize failed for ${session.charger_id} tx ${session.transaction_id}:`, error.message);
    return null;
  }
  return { ...session, ...update };
}

module.exports = {
  POWER,
  ENERGY,
  SOC,
  normalizeMac,
  looksLikeMac,
  getBatterySystems,
  clearBatterySystemsCache,
  inferBatterySystem,
  summarizeSamples,
  energyFromMeters,
  fetchTransactionSamples,
  updateRunningStats,
  recordSessionStart,
  finalizeSession,
};
