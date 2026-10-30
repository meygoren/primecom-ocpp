import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Settings2, Download, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useFleet } from '../contexts/FleetContext';
import { useProfile } from '../contexts/ProfileContext';
import StatusBadge from '../components/StatusBadge';
import { formatDistanceToNow, formatDuration } from '../lib/time';

// Energy dashboard for one charging location (e.g. Swift, San Francisco).
// Answers: what is charging right now and how fast, what happened in each
// session, and how much energy the location delivers per session / per day.

const C = {
  bg: '#0f1117', card: '#1a1d27', inner: '#22263a', border: '#2e3347',
  text: '#f1f5f9', muted: '#8892a4', green: '#47a141', blue: '#3b82f6',
  amber: '#f59e0b', red: '#ef4444', gray: '#6b7280',
};

const UNKNOWN_SYSTEM = { id: 'unknown', label: 'Unknown', color: C.gray };

const SOURCE_LABELS = {
  mac: 'Detected from battery MAC address',
  capacity: 'Estimated from energy vs SoC change',
  energy: 'Inferred from energy delivered (more than the smaller pack holds)',
  charger: 'Set on the charger',
  manual: 'Set manually',
};

const RANGES = [
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
];

const LIVE_POLL_MS = 5000;
const HISTORY_POLL_MS = 30000;

// --- formatting -----------------------------------------------------------

function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function fmtKw(v) { const n = num(v); return n == null ? '—' : `${n.toFixed(1)} kW`; }
function fmtKwh(v, digits = 1) { const n = num(v); return n == null ? '—' : `${n.toFixed(digits)} kWh`; }
// Tile numbers: one decimal below 100, whole numbers with separators above.
function fmtBig(v) {
  const n = num(v);
  if (n == null) return '—';
  return n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1);
}
function fmtSoc(v) { const n = num(v); return n == null ? '—' : `${Math.round(n)}%`; }
function dayKey(ts) { return new Date(ts).toLocaleDateString('en-CA'); } // YYYY-MM-DD, local time
function fmtDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function rangeStart(range) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range.days > 0) d.setDate(d.getDate() - (range.days - 1));
  return d;
}
function durationHours(s, now) {
  if (!s.start_time) return null;
  const end = s.stop_time ? new Date(s.stop_time) : now;
  return (end - new Date(s.start_time)) / 3600000;
}

// --- page -------------------------------------------------------------------

export default function LocationDashboard() {
  const { fleet } = useFleet();
  const profile = useProfile();
  const navigate = useNavigate();
  const canEdit = profile?.role === 'admin' || profile?.role === 'operator';
  const isAdmin = profile?.role === 'admin';

  const [live, setLive] = useState(null);
  const [liveError, setLiveError] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionsError, setSessionsError] = useState(null);
  const [rangeId, setRangeId] = useState(() => localStorage.getItem('location_range') || '7d');
  const [now, setNow] = useState(() => new Date());

  const range = RANGES.find((r) => r.id === rangeId) || RANGES[1];
  const fleetId = fleet?.id;

  // Live feed
  useEffect(() => {
    if (!fleetId) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getFleetLive(fleetId);
        if (!cancelled) { setLive(data); setLiveError(null); setNow(new Date()); }
      } catch (err) {
        if (!cancelled) setLiveError(err.message);
      }
    }
    load();
    const iv = setInterval(load, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [fleetId]);

  // Session history for the selected range
  const [historyTick, setHistoryTick] = useState(0);
  useEffect(() => {
    if (!fleetId) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getFleetSessions(fleetId, { from: rangeStart(range).toISOString() });
        if (!cancelled) { setSessions(data); setSessionsError(null); }
      } catch (err) {
        if (!cancelled) setSessionsError(err.message);
      }
    }
    load();
    const iv = setInterval(load, HISTORY_POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [fleetId, range, historyTick]);

  function selectRange(id) {
    setRangeId(id);
    try { localStorage.setItem('location_range', id); } catch { /* storage unavailable */ }
  }

  const systems = useMemo(() => live?.battery_systems || [], [live]);
  const systemOf = useMemo(() => {
    const map = Object.fromEntries(systems.map((s) => [s.id, s]));
    return (id) => map[id] || UNKNOWN_SYSTEM;
  }, [systems]);

  const chargers = live?.chargers || [];
  const activeSessions = chargers.flatMap((c) => c.sessions);
  const livePowerKw = activeSessions.reduce((sum, s) => sum + (s.stale ? 0 : num(s.power_kw) || 0), 0);
  const onlineCount = chargers.filter((c) => c.status !== 'offline').length;

  const todayKey = dayKey(now);
  const todaySessions = sessions.filter((s) => dayKey(s.start_time) === todayKey);
  const todayKwh = todaySessions.reduce((sum, s) => sum + (num(s.energy_kwh) || 0), 0);

  if (!fleet) return null;

  return (
    <div style={{ padding: '28px clamp(16px, 3vw, 36px)', maxWidth: 1280 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: fleet.color || C.green }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>{fleet.label}</h1>
            {fleet.city && <span style={{ fontSize: 13, color: C.muted }}>{fleet.city}</span>}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Live charging — refreshes every 5 seconds
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => navigate(`/locations?id=${encodeURIComponent(fleet.id)}`)} style={btnStyle()}>
            <Settings2 size={14} /> Manage location
          </button>
        )}
      </div>

      {liveError && <ErrorBanner message={liveError} />}

      {/* Right-now tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatTile label="Chargers online" value={live ? `${onlineCount} / ${chargers.length}` : '—'} />
        <StatTile label="Charging now" value={live ? activeSessions.filter((s) => !s.stale).length : '—'} accent={C.blue} />
        <StatTile label="Live power" value={live ? fmtBig(livePowerKw) : '—'} unit="kW" accent={C.blue} />
        <StatTile label="Energy today" value={fmtBig(todayKwh)} unit="kWh" accent={C.green} />
        <StatTile label="Sessions today" value={todaySessions.length} />
      </div>

      {/* Live chargers */}
      <SectionTitle title="Chargers" subtitle="Live output per charger and connector" />
      {live && chargers.length === 0 ? (
        <EmptyCard>
          No chargers are assigned to {fleet.label} yet.
          {isAdmin && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => navigate(`/locations?id=${encodeURIComponent(fleet.id)}`)} style={btnStyle(true)}>Assign chargers</button>
            </div>
          )}
        </EmptyCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: 16, marginBottom: 32 }}>
          {chargers.map((c) => (
            <LiveChargerCard key={c.charger_id} charger={c} now={now} systemOf={systemOf} onOpen={() => navigate(`/charger/${encodeURIComponent(c.charger_id)}`)} />
          ))}
        </div>
      )}

      {/* Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <SectionTitle title="Summary" subtitle="Sessions that started in the selected period" noMargin />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => selectRange(r.id)} style={pillStyle(r.id === rangeId)}>{r.label}</button>
          ))}
        </div>
      </div>
      {sessionsError && <ErrorBanner message={sessionsError} />}
      <Summary sessions={sessions} systems={systems} systemOf={systemOf} range={range} now={now} />

      {/* History */}
      <SessionHistory
        sessions={sessions}
        systems={systems}
        systemOf={systemOf}
        fleet={fleet}
        canEdit={canEdit}
        now={now}
        onChanged={() => setHistoryTick((t) => t + 1)}
      />
    </div>
  );
}

// --- live charger card --------------------------------------------------------

function LiveChargerCard({ charger, now, systemOf, onOpen }) {
  const charging = charger.sessions.length > 0;
  return (
    <div style={{ background: C.card, border: `1px solid ${charging ? '#1e3a5f' : C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: charging ? 14 : 8 }}>
        <div style={{ minWidth: 0 }}>
          <button onClick={onOpen} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.text, fontSize: 15, fontWeight: 700 }}>
            {charger.charger_id}
          </button>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {charger.location_label || charger.model || ' '}
          </div>
        </div>
        <StatusBadge status={charger.status} />
      </div>

      {!charging && (
        <div style={{ fontSize: 12, color: C.muted }}>
          Not charging · last heartbeat {charger.last_heartbeat ? formatDistanceToNow(charger.last_heartbeat) : 'never'}
        </div>
      )}

      {charger.sessions.map((s) => (
        <LiveSession key={s.id} s={s} now={now} systemOf={systemOf} showConnector={charger.sessions.length > 1 || s.connector_id > 1} />
      ))}
    </div>
  );
}

function LiveSession({ s, now, systemOf, showConnector }) {
  const sys = systemOf(s.battery_system);
  const socPct = num(s.soc);
  return (
    <div style={{ background: C.inner, borderRadius: 10, padding: 14, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div>
          {showConnector && <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Connector {s.connector_id}</div>}
          <div style={{ fontSize: 30, fontWeight: 700, color: s.stale ? C.muted : C.text, lineHeight: 1.1 }}>
            {num(s.power_kw) == null ? '—' : num(s.power_kw).toFixed(1)}
            <span style={{ fontSize: 14, fontWeight: 600, color: C.muted, marginLeft: 4 }}>kW</span>
          </div>
        </div>
        <BatteryBadge sys={sys} source={s.battery_system_source} estCapacity={s.est_capacity_kwh} pending={!s.battery_system} />
      </div>

      {s.stale && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.amber, marginTop: 8 }}>
          <AlertTriangle size={13} /> No meter data since {s.last_sample_at ? formatDistanceToNow(s.last_sample_at) : 'session start'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        <MiniStat label="Delivered" value={fmtKwh(s.energy_kwh)} />
        <MiniStat label="Duration" value={formatDuration(s.start_time, now)} />
        <MiniStat label="Started" value={new Date(s.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} />
        <MiniStat label="Avg" value={fmtKw(s.avg_power_kw)} />
        <MiniStat label="Peak" value={fmtKw(s.max_power_kw)} />
        <MiniStat label="Lowest" value={fmtKw(s.min_power_kw)} />
      </div>

      {socPct != null && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 4 }}>
            <span>State of charge{s.start_soc != null ? ` (started at ${fmtSoc(s.start_soc)})` : ''}</span>
            <span style={{ color: C.text, fontWeight: 600 }}>{fmtSoc(socPct)}</span>
          </div>
          <div style={{ height: 6, background: C.bg, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(0, Math.min(100, socPct))}%`, height: '100%', background: C.green, borderRadius: 999 }} />
          </div>
        </div>
      )}

      {s.curve?.length > 1 && (
        <div style={{ height: 70, marginTop: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={s.curve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`g-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.blue} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis hide domain={[0, 'auto']} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(t) => new Date(t).toLocaleTimeString()}
                formatter={(v) => [`${v} kW`, 'Power']}
              />
              <Area type="monotone" dataKey="kw" stroke={C.blue} strokeWidth={2} fill={`url(#g-${s.id})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {s.battery_mac && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
          Battery MAC <code style={{ color: C.text }}>{s.battery_mac}</code>
        </div>
      )}
    </div>
  );
}

// --- summary ------------------------------------------------------------------

function Summary({ sessions, systems, systemOf, range, now }) {
  const stats = useMemo(() => {
    const withEnergy = sessions.filter((s) => num(s.energy_kwh) != null);
    const totalKwh = withEnergy.reduce((sum, s) => sum + num(s.energy_kwh), 0);
    const finished = sessions.filter((s) => s.stop_time);
    const totalHours = finished.reduce((sum, s) => sum + (durationHours(s, now) || 0), 0);
    const avgKwValues = sessions.map((s) => num(s.avg_power_kw)).filter((v) => v != null);
    const peaks = sessions.map((s) => num(s.max_power_kw)).filter((v) => v != null);

    // Per battery system
    const bySystem = {};
    for (const s of sessions) {
      const id = s.battery_system || 'unknown';
      if (!bySystem[id]) bySystem[id] = { id, sessions: 0, kwh: 0, kwSum: 0, kwCount: 0 };
      bySystem[id].sessions += 1;
      bySystem[id].kwh += num(s.energy_kwh) || 0;
      if (num(s.avg_power_kw) != null) { bySystem[id].kwSum += num(s.avg_power_kw); bySystem[id].kwCount += 1; }
    }

    // Per day, newest first in the table; oldest first in the chart
    const days = {};
    const start = rangeStart(range);
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      days[dayKey(d)] = { day: dayKey(d), sessions: 0, kwh: 0, peak: null };
    }
    for (const s of sessions) {
      const key = dayKey(s.start_time);
      if (!days[key]) days[key] = { day: key, sessions: 0, kwh: 0, peak: null };
      const d = days[key];
      d.sessions += 1;
      d.kwh += num(s.energy_kwh) || 0;
      const sysId = s.battery_system || 'unknown';
      d[sysId] = (d[sysId] || 0) + (num(s.energy_kwh) || 0);
      if (num(s.max_power_kw) != null) d.peak = Math.max(d.peak ?? 0, num(s.max_power_kw));
    }
    const dayList = Object.values(days).sort((a, b) => a.day.localeCompare(b.day));

    return {
      totalKwh,
      count: sessions.length,
      avgKwhPerSession: withEnergy.length ? totalKwh / withEnergy.length : null,
      avgHours: finished.length ? totalHours / finished.length : null,
      avgKw: avgKwValues.length ? avgKwValues.reduce((a, b) => a + b, 0) / avgKwValues.length : null,
      peakKw: peaks.length ? Math.max(...peaks) : null,
      bySystem: Object.values(bySystem),
      dayList,
      activeDays: dayList.filter((d) => d.sessions > 0).length,
    };
  }, [sessions, range, now]);

  // Chart series: every configured system that appears, then Unknown last.
  const chartSystems = [
    ...systems.filter((sys) => stats.bySystem.some((b) => b.id === sys.id)),
    ...(stats.bySystem.some((b) => b.id === 'unknown') ? [UNKNOWN_SYSTEM] : []),
  ];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
        <StatTile label="Energy delivered" value={fmtBig(stats.totalKwh)} unit="kWh" accent={C.green} />
        <StatTile label="Sessions" value={stats.count} />
        <StatTile label="Avg per session" value={fmtBig(stats.avgKwhPerSession)} unit={stats.avgKwhPerSession == null ? null : 'kWh'} />
        <StatTile label="Avg per day" value={stats.activeDays ? fmtBig(stats.totalKwh / Math.max(1, stats.dayList.length)) : '—'} unit={stats.activeDays ? 'kWh' : null} />
        <StatTile label="Avg session length" value={stats.avgHours == null ? '—' : formatHours(stats.avgHours)} />
        <StatTile label="Avg charging rate" value={fmtBig(stats.avgKw)} unit={stats.avgKw == null ? null : 'kW'} />
        <StatTile label="Peak rate" value={fmtBig(stats.peakKw)} unit={stats.peakKw == null ? null : 'kW'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, marginBottom: 32 }}>
        {/* By battery system */}
        <Card title="By battery system">
          {stats.bySystem.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13 }}>No sessions in this period.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>{['System', 'Sessions', 'Energy', 'Avg / session', 'Avg rate'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {[...systems.map((s) => s.id), 'unknown'].map((id) => stats.bySystem.find((b) => b.id === id)).filter(Boolean).map((b) => {
                    const sys = systemOf(b.id);
                    return (
                      <tr key={b.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={tdStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.text, fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: sys.color || C.gray }} />
                            {sys.label}
                            {sys.capacity_kwh && <span style={{ color: C.muted, fontWeight: 400, fontSize: 11 }}>{num(sys.capacity_kwh)} kWh</span>}
                          </span>
                        </td>
                        <td style={tdStyle}>{b.sessions}</td>
                        <td style={tdStyle}>{b.kwh.toFixed(1)} kWh</td>
                        <td style={tdStyle}>{b.sessions ? `${(b.kwh / b.sessions).toFixed(1)} kWh` : '—'}</td>
                        <td style={tdStyle}>{b.kwCount ? `${(b.kwSum / b.kwCount).toFixed(1)} kW` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Daily energy chart */}
        <Card title="Energy per day">
          {stats.dayList.length <= 1 && range.id === 'today' ? (
            <div style={{ color: C.muted, fontSize: 13 }}>Pick 7, 30 or 90 days to see the daily chart.</div>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dayList} margin={{ top: 4, right: 4, bottom: 0, left: -8 }} barCategoryGap={2}>
                  <CartesianGrid stroke={C.border} strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(k) => { const [, m, d] = k.split('-'); return `${+m}/${+d}`; }} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={12} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} unit=" kWh" width={70} />
                  <Tooltip
                    cursor={{ fill: '#ffffff0d' }}
                    contentStyle={tooltipStyle}
                    labelFormatter={fmtDay}
                    formatter={(v, name) => [`${num(v).toFixed(1)} kWh`, name]}
                  />
                  {chartSystems.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: C.muted }} iconType="square" iconSize={8} />}
                  {chartSystems.map((sys, i) => (
                    <Bar
                      key={sys.id}
                      dataKey={sys.id}
                      name={sys.label}
                      stackId="kwh"
                      fill={sys.color || C.gray}
                      stroke={C.card}
                      strokeWidth={1}
                      radius={i === chartSystems.length - 1 ? [4, 4, 0, 0] : 0}
                      maxBarSize={28}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Daily table */}
      {stats.dayList.length > 1 && (
        <Card title="Daily breakdown" style={{ marginBottom: 32 }}>
          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>{['Day', 'Sessions', 'Energy', 'Avg / session', 'Peak rate'].map((h) => <th key={h} style={{ ...thStyle, position: 'sticky', top: 0, background: C.card }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {[...stats.dayList].reverse().map((d) => (
                  <tr key={d.day} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...tdStyle, color: C.text }}>{fmtDay(d.day)}</td>
                    <td style={tdStyle}>{d.sessions || '—'}</td>
                    <td style={tdStyle}>{d.sessions ? `${d.kwh.toFixed(1)} kWh` : '—'}</td>
                    <td style={tdStyle}>{d.sessions ? `${(d.kwh / d.sessions).toFixed(1)} kWh` : '—'}</td>
                    <td style={tdStyle}>{fmtKw(d.peak)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function formatHours(h) {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return hh ? `${hh}h ${mm}m` : `${mm}m`;
}

// --- session history ------------------------------------------------------------

function SessionHistory({ sessions, systems, systemOf, fleet, canEdit, now, onChanged }) {
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(null);
  const [shown, setShown] = useState(25);
  const visible = sessions.slice(0, shown);

  async function setSystem(sessionId, value) {
    setSaving(sessionId);
    try {
      await api.setSessionBatterySystem(sessionId, value || null);
      onChanged();
    } catch (err) {
      alert(`Could not update battery system: ${err.message}`);
    } finally {
      setSaving(null);
    }
  }

  function exportCsv() {
    const headers = ['Charger', 'Connector', 'Transaction', 'Start', 'Stop', 'Duration (min)', 'Energy (kWh)', 'Avg kW', 'Peak kW', 'Lowest kW', 'Start SoC', 'End SoC', 'Battery system', 'Detected by', 'Battery MAC / ID tag', 'Stop reason'];
    const rows = sessions.map((s) => [
      s.charger_id, s.connector_id, s.transaction_id, s.start_time, s.stop_time || '',
      s.stop_time ? Math.round(durationHours(s, now) * 60) : '',
      s.energy_kwh ?? '', s.avg_power_kw ?? '', s.max_power_kw ?? '', s.min_power_kw ?? '',
      s.start_soc ?? '', s.end_soc ?? '',
      s.battery_system ? systemOf(s.battery_system).label : 'Unknown',
      s.battery_system_source || '',
      s.battery_mac || s.id_tag || '', s.stop_reason || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fleet.id}-sessions-${dayKey(now)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <SectionTitle title="Session history" subtitle="Click a session to see its power curve" noMargin />
        <button onClick={exportCsv} disabled={!sessions.length} style={btnStyle()}>
          <Download size={14} /> Export CSV
        </button>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ ...tableStyle, minWidth: 980 }}>
          <thead>
            <tr>
              {['', 'Charger', 'Started', 'Stopped', 'Duration', 'Energy', 'Avg', 'Peak', 'Lowest', 'SoC', 'Battery system', 'Stop reason'].map((h, i) => (
                <th key={i} style={{ ...thStyle, padding: '12px 10px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr><td colSpan={12} style={{ padding: 40, textAlign: 'center', color: C.muted }}>No sessions in this period</td></tr>
            ) : visible.map((s) => {
              const sys = systemOf(s.battery_system);
              const open = expanded === s.id;
              return (
                <Fragment key={s.id}>
                  <tr
                    onClick={() => setExpanded(open ? null : s.id)}
                    style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer', background: open ? C.inner : 'transparent' }}
                  >
                    <td style={{ ...tdStyle, padding: '10px 4px 10px 12px', color: C.muted }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td style={{ ...tdStyle, color: C.green, fontWeight: 600 }}>
                      {s.charger_id}
                      {s.connector_id > 1 && <span style={{ color: C.muted, fontWeight: 400 }}> · {s.connector_id}</span>}
                    </td>
                    <td style={tdStyle}>{fmtTime(s.start_time)}</td>
                    <td style={tdStyle}>{s.stop_time ? fmtTime(s.stop_time) : <span style={{ color: C.blue, fontWeight: 600 }}>Charging</span>}</td>
                    <td style={tdStyle}>{formatDuration(s.start_time, s.stop_time || now)}</td>
                    <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>{fmtKwh(s.energy_kwh)}</td>
                    <td style={tdStyle}>{fmtKw(s.avg_power_kw)}</td>
                    <td style={tdStyle}>{fmtKw(s.max_power_kw)}</td>
                    <td style={tdStyle}>{fmtKw(s.min_power_kw)}</td>
                    <td style={tdStyle}>{s.start_soc != null || s.end_soc != null ? `${fmtSoc(s.start_soc)} → ${fmtSoc(s.end_soc)}` : '—'}</td>
                    <td style={tdStyle} onClick={(e) => canEdit && e.stopPropagation()}>
                      {canEdit ? (
                        <select
                          value={s.battery_system_source === 'manual' ? s.battery_system : ''}
                          disabled={saving === s.id}
                          onChange={(e) => setSystem(s.id, e.target.value)}
                          title={s.battery_system_source ? SOURCE_LABELS[s.battery_system_source] : 'Not detected yet'}
                          style={{ ...selectStyle, borderColor: sys.color || C.border }}
                        >
                          <option value="">{s.battery_system && s.battery_system_source !== 'manual' ? `Auto: ${sys.label}` : 'Auto: Unknown'}</option>
                          {systems.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                      ) : (
                        <BatteryBadge sys={sys} source={s.battery_system_source} estCapacity={s.est_capacity_kwh} pending={!s.battery_system} small />
                      )}
                    </td>
                    <td style={tdStyle}>{s.stop_reason || '—'}</td>
                  </tr>
                  {open && (
                    <tr style={{ background: C.inner }}>
                      <td colSpan={12} style={{ padding: '0 16px 16px' }}>
                        <SessionDetail session={s} fleetId={fleet.id} sys={sys} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {sessions.length > shown && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => setShown((n) => n + 50)} style={btnStyle()}>
            Show more ({sessions.length - shown} older)
          </button>
        </div>
      )}
      {sessions.length >= 2000 && (
        <div style={{ fontSize: 12, color: C.amber, marginTop: 8 }}>Showing the most recent 2000 sessions. Pick a shorter period to see all.</div>
      )}
    </>
  );
}

function SessionDetail({ session, fleetId, sys }) {
  const [curve, setCurve] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getSessionCurve(fleetId, session.id)
      .then((d) => { if (!cancelled) setCurve(d); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [fleetId, session.id]);

  const points = curve?.points?.filter((p) => p.kw != null) || [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16, paddingTop: 4 }}>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.9 }}>
        <div>Transaction <span style={{ color: C.text }}>{session.transaction_id}</span></div>
        <div>ID tag <code style={{ color: C.text }}>{session.id_tag || '—'}</code></div>
        <div>Battery MAC <code style={{ color: C.text }}>{session.battery_mac || '—'}</code></div>
        <div>
          Battery system <span style={{ color: C.text }}>{sys.label}</span>
          {session.battery_system_source && <span> — {SOURCE_LABELS[session.battery_system_source]}</span>}
          {session.est_capacity_kwh && <span> (pack ≈ {num(session.est_capacity_kwh).toFixed(0)} kWh)</span>}
        </div>
        <div>Meter <span style={{ color: C.text }}>{session.meter_start_wh != null ? `${(num(session.meter_start_wh) / 1000).toFixed(1)}` : '—'} → {session.meter_stop_wh != null ? `${(num(session.meter_stop_wh) / 1000).toFixed(1)}` : '—'} kWh</span></div>
        <div>Power readings used <span style={{ color: C.text }}>{session.power_sample_count ?? '—'}</span></div>
      </div>
      <div style={{ minHeight: 180 }}>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Charging power (kW) — hover for SoC</div>
        {error ? (
          <div style={{ color: C.red, fontSize: 12 }}>{error}</div>
        ) : !curve ? (
          <div style={{ color: C.muted, fontSize: 12 }}>Loading…</div>
        ) : points.length < 2 ? (
          <div style={{ color: C.muted, fontSize: 12 }}>{curve.note || 'Not enough power readings to draw a curve.'}</div>
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={50} domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(t) => new Date(t).toLocaleTimeString()}
                  formatter={(v, name, item) => {
                    const soc = item?.payload?.soc;
                    return [`${v} kW${soc != null ? ` · SoC ${Math.round(soc)}%` : ''}`, 'Power'];
                  }}
                />
                <Area type="monotone" dataKey="kw" stroke={C.blue} strokeWidth={2} fill={C.blue} fillOpacity={0.15} isAnimationActive={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// --- small pieces -----------------------------------------------------------------

function BatteryBadge({ sys, source, estCapacity, pending, small }) {
  const color = pending ? C.muted : (sys.color || C.gray);
  const title = pending
    ? 'Not identified yet. Detection uses the battery MAC, then energy vs SoC change, then total energy.'
    : `${SOURCE_LABELS[source] || ''}${estCapacity ? ` — pack ≈ ${num(estCapacity).toFixed(0)} kWh` : ''}`;
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
      border: `1px solid ${color}55`, background: `${color}1a`, color: C.text,
      borderRadius: 999, padding: small ? '1px 8px' : '3px 10px', fontSize: small ? 11 : 12, fontWeight: 600,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {pending ? 'Identifying…' : sys.label}
      {!pending && source && source !== 'manual' && source !== 'charger' && (
        <span style={{ color: C.muted, fontWeight: 500 }}>{source === 'mac' ? 'MAC' : 'est.'}</span>
      )}
    </span>
  );
}

function StatTile({ label, value, unit, accent }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
        {accent && <span style={{ width: 4, height: 20, borderRadius: 2, background: accent, flexShrink: 0 }} />}
        <span>
          {value}
          {unit && <span style={{ fontSize: 13, fontWeight: 600, color: C.muted, marginLeft: 4 }}>{unit}</span>}
        </span>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ title, subtitle, noMargin }) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 14 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function Card({ title, children, style }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, ...style }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function EmptyCard({ children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: C.muted, fontSize: 14, marginBottom: 32 }}>
      {children}
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#3f151555', border: `1px solid ${C.red}55`, color: C.text, borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
      <AlertTriangle size={14} color={C.red} /> {message}
    </div>
  );
}

function btnStyle(primary) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: primary ? C.green : C.inner, border: `1px solid ${primary ? C.green : C.border}`,
    borderRadius: 8, padding: '7px 14px', color: primary ? '#fff' : C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };
}

function pillStyle(active) {
  return {
    background: active ? '#2d5c2a33' : C.inner, border: `1px solid ${active ? C.green : C.border}`,
    borderRadius: 6, padding: '5px 12px', color: active ? C.green : C.muted, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  };
}

const tooltipStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { padding: '8px 10px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' };
const tdStyle = { padding: '10px', color: C.muted, whiteSpace: 'nowrap' };
const selectStyle = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, padding: '4px 6px', cursor: 'pointer' };
