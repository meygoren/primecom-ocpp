// Demo mode for the location energy dashboard.
//
// Generates realistic, simulated charging data entirely in the browser —
// nothing is read from or written to the server. The same simulation drives
// the live cards, the summary and the session history, so the numbers agree
// with each other and keep moving as time passes (power tapers as the battery
// fills, sessions finish, new ones start).
//
// Each demo charger runs a repeating cycle: idle for a while, then a battery
// system plugs in and charges until it reaches its target state of charge.
// Every cycle is seeded from the charger and cycle number, so reloading the
// page shows the same history.

export const DEMO_BATTERY_SYSTEMS = [
  { id: 'primecom', label: 'Primecom', capacity_kwh: 450, mac_addresses: ['020000004501'], color: '#47a141', sort_order: 1 },
  { id: 'setec',    label: 'SETEC',    capacity_kwh: 240, mac_addresses: ['020000002402'], color: '#a855f7', sort_order: 2 },
];

const MAC = { primecom: '02:00:00:00:45:01', setec: '02:00:00:00:24:02' };

// Charger line-up. cycleMin = minutes between plug-ins on average.
const DEMO_CHARGERS = [
  { n: 1, bay: 'Bay 1', model: 'DC 150', ratedKw: 150, cycleMin: 330, offsetMin: 40,  primecomShare: 0.8 },
  { n: 2, bay: 'Bay 2', model: 'DC 150', ratedKw: 150, cycleMin: 290, offsetMin: 175, primecomShare: 0.55 },
  { n: 3, bay: 'Bay 3', model: 'DC 120', ratedKw: 120, cycleMin: 380, offsetMin: 95,  primecomShare: 0.65 },
  { n: 4, bay: 'Bay 4', model: 'DC 60',  ratedKw: 60,  cycleMin: 520, offsetMin: 300, primecomShare: 0.3 },
];

const MIN = 60 * 1000;

// --- deterministic randomness ----------------------------------------------

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(seed, i) {
  return rng(seed * 7919 + i)() - 0.5;
}

// --- one simulated session ---------------------------------------------------

const simCache = new Map();

// Simulates a session minute by minute until the battery reaches its target.
// Returns the full series: [{ t, kw, soc, kwh }]
function simulate(plan) {
  if (simCache.has(plan.id)) return simCache.get(plan.id);

  const series = [];
  let soc = plan.startSoc;
  let kwh = 0;
  const maxMinutes = 10 * 60;

  for (let i = 0; i < maxMinutes && soc < plan.targetSoc; i++) {
    const frac = soc / 100;
    // Constant power until 80%, then the pack tapers the charge rate.
    let kw = plan.peakKw * (frac < 0.8 ? 1 : Math.max(0.15, 1 - ((frac - 0.8) / 0.2) * 0.85));
    if (i < 3) kw *= [0.3, 0.6, 0.9][i]; // ramp up
    kw *= 1 + noise(plan.seed, i) * 0.06;  // small fluctuation
    kw = Math.min(kw, plan.charger.ratedKw); // never above the charger's rating
    kwh += kw / 60;
    soc = Math.min(100, soc + (kw / 60 / plan.capacityKwh) * 100);
    series.push({ t: plan.startMs + (i + 1) * MIN, kw, soc, kwh });
  }

  simCache.set(plan.id, series);
  return series;
}

// Plans (not yet simulated) for every session that starts in [fromMs, toMs].
function planSessions(fleetPrefix, fromMs, toMs) {
  const plans = [];
  for (const ch of DEMO_CHARGERS) {
    const cycleMs = ch.cycleMin * MIN;
    const first = Math.floor((fromMs - ch.offsetMin * MIN) / cycleMs) - 1;
    const last = Math.floor((toMs - ch.offsetMin * MIN) / cycleMs);

    for (let k = first; k <= last; k++) {
      const seed = ch.n * 100003 + k;
      const r = rng(seed);
      const cycleStart = k * cycleMs + ch.offsetMin * MIN;
      const startMs = cycleStart + Math.floor(r() * 0.25 * cycleMs);
      if (startMs < fromMs || startMs > toMs) continue;

      const system = r() < ch.primecomShare ? 'primecom' : 'setec';
      const capacityKwh = system === 'primecom' ? 450 : 240;
      const startSoc = 8 + Math.floor(r() * 35);
      const targetSoc = 88 + Math.floor(r() * 12);
      const peakKw = ch.ratedKw * (0.86 + r() * 0.12);

      // How the system was identified: usually by MAC; some sessions are
      // remote-started (no MAC) and identified from energy vs SoC instead.
      const detect = r();
      const source = detect < 0.72 ? 'mac' : detect < 0.95 ? 'capacity' : null;

      plans.push({
        id: `demo-${ch.n}-${k}`,
        seed,
        charger: ch,
        charger_id: `${fleetPrefix}-DC-0${ch.n}`,
        transaction_id: 5000 + Math.abs(k * 4 + ch.n) % 90000,
        startMs,
        system,
        capacityKwh,
        startSoc,
        targetSoc,
        peakKw,
        source,
        stopReason: r() < 0.85 ? 'EVDisconnected' : 'Local',
      });
    }
  }
  return plans;
}

// Turns a plan + its simulated series (cut off at nowMs) into stats.
function summarize(plan, nowMs) {
  const full = simulate(plan);
  const series = full.filter((p) => p.t <= nowMs);
  const finished = full.length > 0 && full[full.length - 1].t <= nowMs;
  const charging = series.filter((p) => p.kw >= 0.5);
  const last = series[series.length - 1];

  const energyKwh = last ? last.kwh : 0;
  const startSoc = plan.startSoc;
  const endSoc = last ? last.soc : startSoc;
  const meterStartWh = 1_000_000 + (plan.seed % 500) * 1000;

  // Battery identification, mirroring the real server logic.
  let batterySystem = null;
  let source = null;
  let estCapacity = null;
  if (plan.source === 'mac') {
    batterySystem = plan.system;
    source = 'mac';
  } else if (plan.source === 'capacity' && endSoc - startSoc >= 10) {
    estCapacity = Math.round((energyKwh / ((endSoc - startSoc) / 100)) * 10) / 10;
    batterySystem = Math.abs(estCapacity - 450) < Math.abs(estCapacity - 240) ? 'primecom' : 'setec';
    source = 'capacity';
  } else if (energyKwh > 252) {
    batterySystem = 'primecom';
    source = 'energy';
  }

  return {
    finished,
    series,
    row: {
      id: plan.id,
      charger_id: plan.charger_id,
      connector_id: 1,
      transaction_id: plan.transaction_id,
      id_tag: plan.source === 'mac' ? MAC[plan.system] : 'AUTO',
      battery_mac: plan.source === 'mac' ? MAC[plan.system].replace(/:/g, '') : null,
      start_time: new Date(plan.startMs).toISOString(),
      stop_time: finished ? new Date(last.t).toISOString() : null,
      energy_kwh: Math.round(energyKwh * 1000) / 1000,
      avg_power_kw: charging.length ? round2(charging.reduce((a, p) => a + p.kw, 0) / charging.length) : null,
      max_power_kw: charging.length ? round2(Math.max(...charging.map((p) => p.kw))) : null,
      min_power_kw: charging.length ? round2(Math.min(...charging.map((p) => p.kw))) : null,
      power_sample_count: charging.length,
      start_soc: round1(startSoc),
      end_soc: round1(endSoc),
      meter_start_wh: meterStartWh,
      meter_stop_wh: meterStartWh + Math.round(energyKwh * 1000),
      battery_system: batterySystem,
      battery_system_source: source,
      est_capacity_kwh: estCapacity,
      stop_reason: finished ? plan.stopReason : null,
      in_progress: !finished,
    },
  };
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }

function downsample(points, max) {
  const step = Math.max(1, Math.ceil(points.length / max));
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

export function demoPrefix(fleet) {
  return String(fleet?.label || 'DEMO').toUpperCase().replace(/[^A-Z0-9]+/g, '') || 'DEMO';
}

// --- public API: same shapes as the real /api/fleets/:id endpoints ------------

// Same shape as GET /api/fleets/:id/live
export function getDemoLive(fleet, nowMs = Date.now()) {
  const prefix = demoPrefix(fleet);
  // Any session that could still be running started within the last 10 hours.
  const plans = planSessions(prefix, nowMs - 10 * 60 * MIN, nowMs);
  const active = plans
    .map((p) => ({ plan: p, ...summarize(p, nowMs) }))
    .filter((s) => !s.finished && s.series.length > 0);

  const chargers = DEMO_CHARGERS.map((ch) => {
    const id = `${prefix}-DC-0${ch.n}`;
    const sessions = active.filter((s) => s.plan.charger.n === ch.n).map(({ plan, row, series }) => {
      // The simulation steps once a minute; blend toward the next step so the
      // 5-second refresh shows the numbers moving.
      const last = series[series.length - 1];
      const next = simulate(plan)[series.length];
      const f = next ? Math.min(1, (nowMs - last.t) / MIN) : 0;
      const lerp = (k) => (next ? last[k] + (next[k] - last[k]) * f : last[k]);
      const energy = lerp('kwh');
      return {
        ...row,
        power_kw: lerp('kw'),
        soc: lerp('soc'),
        energy_kwh: Math.round(energy * 1000) / 1000,
        meter_stop_wh: row.meter_start_wh + Math.round(energy * 1000),
        last_sample_at: new Date(nowMs - 4000).toISOString(),
        stale: false,
        curve: downsample(series, 240).map((p) => ({ t: p.t, kw: Math.round(p.kw * 10) / 10 })),
      };
    });
    return {
      charger_id: id,
      location_label: ch.bay,
      status: sessions.length ? 'charging' : 'online',
      connected: true,
      last_heartbeat: new Date(nowMs - ((ch.n * 13000) % 60000)).toISOString(),
      model: ch.model,
      rated_kw: ch.ratedKw,
      battery_system: 'auto',
      sessions,
    };
  });

  return { chargers, battery_systems: DEMO_BATTERY_SYSTEMS, server_time: new Date(nowMs).toISOString(), demo: true };
}

// Same shape as GET /api/fleets/:id/sessions?from=
export function getDemoSessions(fleet, fromMs, nowMs = Date.now()) {
  const plans = planSessions(demoPrefix(fleet), fromMs, nowMs);
  return plans
    .map((p) => summarize(p, nowMs).row)
    .sort((a, b) => b.start_time.localeCompare(a.start_time));
}

// Same shape as GET /api/fleets/:id/sessions/:sessionId/curve
export function getDemoCurve(sessionId, nowMs = Date.now()) {
  const series = (simCache.get(sessionId) || []).filter((p) => p.t <= nowMs);
  return {
    points: downsample(series, 300).map((p) => ({ t: p.t, kw: Math.round(p.kw * 10) / 10, soc: Math.round(p.soc) })),
    sample_count: series.length * 3,
    note: series.length ? null : 'No simulated readings for this session.',
  };
}
