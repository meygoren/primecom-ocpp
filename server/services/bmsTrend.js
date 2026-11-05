// Day-by-day trend for one battery, built from the summaries of every BMS log
// uploaded for it. Logs are expected roughly every 24 hours, but any spacing
// works: the direction of each metric is a least-squares slope over real time.

// better: which direction is good for the battery ('lower' / 'higher'), or
//         null for usage metrics where up or down is neither good nor bad.
// tol:    change across the whole period below this counts as "stable".
const TREND_METRICS = [
  { key: 'discharge_kwh', better: null, tol: 0 },
  { key: 'charge_kwh', better: null, tol: 0 },
  { key: 'avg_discharge_kw', better: null, tol: 0 },
  { key: 'peak_discharge_a', better: null, tol: 0 },
  { key: 'max_temp_c', better: 'lower', tol: 1 },
  { key: 'max_temp_spread_c', better: 'lower', tol: 1 },
  { key: 'max_cell_spread_mv', better: 'lower', tol: 10 },
  { key: 'weakest_cell_dev_mv', better: 'higher', tol: 5 },
  { key: 'min_cell_v', better: 'higher', tol: 0.02 },
  { key: 'soh', better: 'higher', tol: 0.2 },
  { key: 'charge_restarts', better: 'lower', tol: 1 },
  { key: 'min_insulation_kohm', better: 'higher', tol: 2000 },
];

const DAY = 86400000;

function slopePerDay(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of points) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  return den ? num / den : 0;
}

function r(v, d = 2) {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// rows: [{ id, start_time, label, file_name, summary }] sorted oldest first.
function buildTrend(rows) {
  const points = rows.map((row) => ({
    id: row.id,
    start: row.summary?.start ?? new Date(row.start_time).getTime(),
    file_name: row.file_name,
    summary: row.summary || {},
  }));

  const metrics = TREND_METRICS.map((m) => {
    const vals = points
      .map((p) => ({ x: p.start / DAY, y: p.summary[m.key] }))
      .filter((p) => p.y != null && Number.isFinite(Number(p.y)))
      .map((p) => ({ x: p.x, y: Number(p.y) }));
    if (!vals.length) return { key: m.key, better: m.better, count: 0 };

    const first = vals[0].y;
    const last = vals[vals.length - 1].y;
    const prev = vals.length > 1 ? vals[vals.length - 2].y : null;
    const perDay = slopePerDay(vals);
    const spanDays = vals[vals.length - 1].x - vals[0].x;
    const overall = perDay != null ? perDay * spanDays : null;

    let direction = null;
    if (vals.length >= 2) {
      if (overall == null || Math.abs(overall) <= m.tol) direction = 'stable';
      else if (!m.better) direction = overall > 0 ? 'up' : 'down';
      else direction = (overall < 0) === (m.better === 'lower') ? 'improving' : 'worsening';
    }

    return {
      key: m.key,
      better: m.better,
      count: vals.length,
      first: r(first, 3),
      last: r(last, 3),
      previous: r(prev, 3),
      change_vs_previous: prev != null ? r(last - prev, 3) : null,
      change_overall: r(last - first, 3),
      per_day: r(perDay, 3),
      average: r(vals.reduce((a, p) => a + p.y, 0) / vals.length, 2),
      direction,
    };
  });

  // Is the same cell the weakest log after log?
  const weakIds = points.map((p) => p.summary.weakest_cell).filter((v) => v != null);
  const counts = {};
  for (const id of weakIds) counts[id] = (counts[id] || 0) + 1;
  const repeatWeak = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  const hotIds = points.map((p) => p.summary.hottest_sensor).filter((v) => v != null);
  const hotCounts = {};
  for (const id of hotIds) hotCounts[id] = (hotCounts[id] || 0) + 1;
  const repeatHot = Object.entries(hotCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    logs: points.length,
    first_start: points[0]?.start ?? null,
    last_start: points[points.length - 1]?.start ?? null,
    metrics,
    recurring_weak_cell: repeatWeak ? { cell: Number(repeatWeak[0]), logs: repeatWeak[1], of: weakIds.length } : null,
    recurring_hot_sensor: repeatHot ? { sensor: Number(repeatHot[0]), logs: repeatHot[1], of: hotIds.length } : null,
    points: points.map((p) => ({
      id: p.id,
      start: p.start,
      ...Object.fromEntries(TREND_METRICS.map((m) => [m.key, p.summary[m.key] ?? null])),
      weakest_cell: p.summary.weakest_cell ?? null,
      warnings: p.summary.warnings || null,
    })),
  };
}

module.exports = { buildTrend, TREND_METRICS };
