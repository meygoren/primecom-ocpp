const supabase = require('../db/supabase');

// ── Time-to-full predictor ────────────────────────────────────────────────────
//
// Blends three independent estimates of how long until the battery hits 100%:
//
//   1. OBSERVED RATE  — linear regression over the last 30 min of real SoC
//                       readings. This is the strongest signal because it
//                       reflects what the charger is actually doing right now.
//   2. HISTORICAL     — average %/min charge rate from the last 14 days,
//                       bucketed by 10% SOC band. Captures the fact that
//                       charging 90→100% is slower than 40→50%.
//   3. PHYSICS        — remaining kWh / current kW, with a taper model above
//                       88% SOC (chargers throttle near the top).
//
// The blend weights observed rate highest. Anything unavailable is skipped
// and the weights are re-normalized.

const PACK_KWH = 450;          // battery pack capacity per truck side
const TAPER_START = 88;        // SOC % where the charger starts throttling
const TAPER_END_FRACTION = 0.3; // power at 100% ≈ 30% of bulk power

// In-memory cache for historical bucket rates (per charger, 10 min TTL)
const historyCache = new Map();
const HISTORY_TTL_MS = 10 * 60 * 1000;

// ── Method 3: physics estimate with taper ────────────────────────────────────

function physicsEstimate(soc, kw) {
  if (kw == null || kw <= 0 || soc == null || soc >= 100) return null;

  let minutes = 0;

  // Bulk phase: full power up to the taper point
  if (soc < TAPER_START) {
    const kwh = ((TAPER_START - soc) / 100) * PACK_KWH;
    minutes += (kwh / kw) * 60;
  }

  // Taper phase: power ramps down linearly to TAPER_END_FRACTION at 100%
  const taperFrom = Math.max(soc, TAPER_START);
  if (taperFrom < 100) {
    const kwh = ((100 - taperFrom) / 100) * PACK_KWH;
    const avgKw = kw * ((1 + TAPER_END_FRACTION) / 2);
    minutes += (kwh / avgKw) * 60;
  }

  return minutes;
}

// ── Method 1: observed rate from recent SoC samples ──────────────────────────

async function observedRateEstimate(ocppId, soc) {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('meter_values')
    .select('value, timestamp')
    .eq('charger_id', ocppId)
    .eq('measurand', 'SoC')
    .gte('timestamp', since)
    .order('timestamp', { ascending: true })
    .limit(120);

  if (error || !data || data.length < 4) return null;

  // Linear regression: SoC (%) vs time (minutes)
  const t0 = new Date(data[0].timestamp).getTime();
  const points = data.map((r) => ({
    x: (new Date(r.timestamp).getTime() - t0) / 60000,
    y: parseFloat(r.value),
  }));

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom; // %/min

  // Ignore flat or negative slopes (idle, discharging, or noise)
  if (slope < 0.01) return null;

  return (100 - soc) / slope;
}

// ── Method 2: historical %/min rates per 10% SOC bucket ──────────────────────

async function getHistoricalBucketRates(ocppId) {
  const cached = historyCache.get(ocppId);
  if (cached && Date.now() - cached.at < HISTORY_TTL_MS) return cached.rates;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('meter_values')
    .select('value, timestamp')
    .eq('charger_id', ocppId)
    .eq('measurand', 'SoC')
    .gte('timestamp', since)
    .order('timestamp', { ascending: true })
    .limit(2000);

  if (error || !data || data.length < 10) {
    historyCache.set(ocppId, { at: Date.now(), rates: null });
    return null;
  }

  // Walk consecutive samples; collect %/min deltas into 10% buckets.
  // Skip gaps over 10 min (separate sessions) and non-charging deltas.
  const buckets = Array.from({ length: 10 }, () => ({ sum: 0, count: 0 }));
  for (let i = 1; i < data.length; i++) {
    const prevSoc = parseFloat(data[i - 1].value);
    const currSoc = parseFloat(data[i].value);
    const dtMin = (new Date(data[i].timestamp) - new Date(data[i - 1].timestamp)) / 60000;
    if (dtMin <= 0 || dtMin > 10) continue;
    const dSoc = currSoc - prevSoc;
    if (dSoc <= 0) continue;
    const rate = dSoc / dtMin; // %/min
    if (rate > 5) continue; // physically implausible, skip noise
    const bucket = Math.min(9, Math.floor(prevSoc / 10));
    buckets[bucket].sum += rate;
    buckets[bucket].count += 1;
  }

  const rates = buckets.map((b) => (b.count >= 3 ? b.sum / b.count : null));
  const hasAny = rates.some((r) => r !== null);
  const result = hasAny ? rates : null;
  historyCache.set(ocppId, { at: Date.now(), rates: result });
  return result;
}

function historicalEstimate(soc, bucketRates) {
  if (!bucketRates || soc == null || soc >= 100) return null;

  // Integrate remaining time bucket by bucket from current SOC to 100%.
  // Buckets with no data fall back to the nearest known bucket below.
  let minutes = 0;
  let lastKnownRate = null;
  for (let b = 0; b < 10; b++) {
    if (bucketRates[b] !== null) lastKnownRate = bucketRates[b];
    const bucketStart = b * 10;
    const bucketEnd = bucketStart + 10;
    if (bucketEnd <= soc) continue;

    const from = Math.max(soc, bucketStart);
    const rate = bucketRates[b] ?? lastKnownRate;
    if (rate === null || rate <= 0) return null; // no usable data yet
    minutes += (bucketEnd - from) / rate;
  }
  return minutes;
}

// ── Blended prediction ────────────────────────────────────────────────────────

async function predictTimeToFull(ocppId, soc, powerKw) {
  if (soc == null || soc >= 100) return null;

  const [observed, bucketRates] = await Promise.all([
    observedRateEstimate(ocppId, soc),
    getHistoricalBucketRates(ocppId),
  ]);
  const historical = historicalEstimate(soc, bucketRates);
  const physics = physicsEstimate(soc, powerKw);

  const parts = [];
  if (observed !== null) parts.push({ minutes: observed, weight: 0.5, method: 'observed' });
  if (historical !== null) parts.push({ minutes: historical, weight: 0.3, method: 'historical' });
  if (physics !== null) parts.push({ minutes: physics, weight: 0.2, method: 'physics' });

  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const minutes = parts.reduce((s, p) => s + p.minutes * (p.weight / totalWeight), 0);

  return {
    minutes: Math.round(minutes),
    methods: parts.map((p) => p.method),
    confidence: parts.length === 3 ? 'high' : parts.length === 2 ? 'medium' : 'low',
  };
}

module.exports = { predictTimeToFull };
