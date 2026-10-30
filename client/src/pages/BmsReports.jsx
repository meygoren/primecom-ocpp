import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import { Upload, Settings2, ArrowLeft, Trash2, AlertTriangle, AlertCircle, Info, X, Pencil, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// BMS Reports: upload the .xlsx log exported from the Primecom battery's
// online BMS and read the analysis. The analysis itself is done on the server
// (server/services/bmsAnalyzer.js) and re-run with the current settings each
// time a report is opened.

const C = {
  bg: '#0f1117', card: '#1a1d27', inner: '#22263a', border: '#2e3347',
  text: '#f1f5f9', muted: '#8892a4', green: '#47a141', blue: '#3b82f6',
  amber: '#f59e0b', red: '#ef4444',
  // chart series (validated for the dark surface)
  s1: '#3987e5', s2: '#d95926', s3: '#199e70',
};

const LEVEL = {
  critical: { color: C.red, label: 'Critical', Icon: AlertCircle },
  warning: { color: C.amber, label: 'Warning', Icon: AlertTriangle },
  info: { color: C.blue, label: 'Info', Icon: Info },
};

// Section toggles shown in the settings panel, in page order.
const SECTIONS = [
  ['overview', 'Overview tiles', 'Energy in/out, peak and average power, SOC, SOH, temperatures'],
  ['warnings', 'Warnings', 'Everything the analysis flagged, most serious first'],
  ['comparison', 'Compared with previous report', 'Changes since the last log from the same battery'],
  ['events', 'Charge and discharge sessions', 'Each session: duration, kWh, kW, amps, SOC, temperature rise'],
  ['power_chart', 'Power and SOC charts', 'kW in/out and state of charge over time'],
  ['temperature', 'Temperature', 'Max / average / min cell temperature over time, hottest sensors'],
  ['temp_derating', 'Temperature vs power', 'Average kW and amps at each temperature band'],
  ['cells', 'Cell voltages', 'Highest / lowest cell voltage and spread over time, balancing'],
  ['cell_outliers', 'Weak cells and hot spots', 'Cells that sit lowest, sensors that run hottest'],
  ['vehicles', 'Vehicles served', 'Estimated vehicle charges from energy discharged'],
  ['energy', 'Lifetime energy', 'BMS lifetime counters, equivalent full cycles'],
  ['insulation', 'Insulation and 12 V supply', 'Lowest insulation resistance and auxiliary supply'],
  ['faults', 'Faults and snapshots', 'Fault codes and fault-snapshot readings in the file'],
  ['gaps', 'Data gaps', 'Periods where the battery stopped reporting'],
];

const LIMIT_FIELDS = [
  ['discharge_current_a', 'Discharge current limit', 'A'],
  ['system_kw', 'Battery system rating', 'kW'],
  ['charger_kw', 'AC-DC charger rating', 'kW'],
  ['nominal_kwh', 'Battery capacity (blank = from file)', 'kWh'],
  ['vehicle_name', 'Vehicle being charged', ''],
  ['vehicle_session_kwh', 'Energy per vehicle charge', 'kWh'],
];

const THRESHOLD_FIELDS = [
  ['temp_warn_c', 'Temperature warning', '°C'],
  ['temp_crit_c', 'Temperature critical', '°C'],
  ['temp_spread_warn_c', 'Hottest vs coolest sensor', '°C'],
  ['temp_rise_warn_c_per_min', 'Temperature rise rate', '°C/min'],
  ['cell_spread_warn_v', 'Cell spread warning', 'V'],
  ['cell_spread_crit_v', 'Cell spread critical', 'V'],
  ['cell_high_warn_v', 'High cell warning', 'V'],
  ['cell_high_crit_v', 'High cell critical', 'V'],
  ['cell_low_warn_v', 'Low cell warning', 'V'],
  ['cell_low_crit_v', 'Low cell critical', 'V'],
  ['insulation_warn_ohm_per_v', 'Insulation warning', 'Ω/V'],
  ['insulation_crit_ohm_per_v', 'Insulation critical', 'Ω/V'],
  ['supply_low_v', '12 V supply low', 'V'],
  ['soh_warn_pct', 'SOH warning', '%'],
  ['soc_low_warn_pct', 'Low SOC warning', '%'],
  ['gap_warn_min', 'Data gap', 'min'],
  ['interruptions_warn', 'Charging restarts per session', ''],
  ['charger_shortfall_pct', 'Charger delivered < requested', '%'],
  ['current_limit_pct', 'Counts as "at current limit" from', '% of limit'],
];

const EVENT_FIELDS = [
  ['idle_current_a', 'Idle below', 'A'],
  ['merge_gap_min', 'Join sessions paused less than', 'min'],
  ['min_event_kwh', 'Ignore sessions under', 'kWh'],
];

// --- formatting -------------------------------------------------------------

function n(v) { const x = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(x) ? x : null; }
function fmt(v, unit = '', d = 1) {
  const x = n(v);
  if (x == null) return '—';
  const s = Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : x.toFixed(d).replace(/\.0+$/, '');
  return unit ? `${s} ${unit}` : s;
}
function fmtDate(t) { return t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }
function fmtTime(t) { return t ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'; }
function fmtMin(m) {
  const x = n(m);
  if (x == null) return '—';
  if (x < 60) return `${Math.round(x)}m`;
  return `${Math.floor(x / 60)}h ${Math.round(x % 60)}m`;
}
function shortId(id) { return id ? `${String(id).slice(0, 6)}…${String(id).slice(-4)}` : '—'; }

// --- page -------------------------------------------------------------------

export default function BmsReports() {
  const { id } = useParams();
  const [settings, setSettings] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [version, setVersion] = useState(0); // bump to reload the report after settings change

  useEffect(() => {
    api.getBmsSettings()
      .then((r) => { setSettings(r.settings); setDefaults(r.defaults); })
      .catch((err) => setSettingsError(err.message));
  }, []);

  return (
    <div style={{ padding: '28px clamp(16px, 3vw, 36px)', maxWidth: 1280 }}>
      {id ? (
        <ReportDetail id={id} version={version} onOpenSettings={() => setShowSettings(true)} />
      ) : (
        <ReportList onOpenSettings={() => setShowSettings(true)} settingsError={settingsError} />
      )}
      {showSettings && settings && (
        <SettingsPanel
          settings={settings}
          defaults={defaults}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => { setSettings(s); setVersion((v) => v + 1); }}
        />
      )}
    </div>
  );
}

// --- list + upload ------------------------------------------------------------

function ReportList({ onOpenSettings, settingsError }) {
  const navigate = useNavigate();
  const profile = useProfile();
  const canUpload = profile?.role === 'admin' || profile?.role === 'operator';
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);
  const [uploads, setUploads] = useState([]); // [{ name, status, message, id }]
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  async function load() {
    try {
      setReports(await api.getBmsReports());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function uploadFiles(files) {
    const list = [...files].filter((f) => /\.xlsx$/i.test(f.name));
    if (!list.length) {
      setUploads([{ name: 'Upload', status: 'error', message: 'Choose .xlsx files exported from the BMS platform.' }]);
      return;
    }
    setUploads(list.map((f) => ({ name: f.name, status: 'waiting' })));
    let lastId = null;
    for (let k = 0; k < list.length; k++) {
      setUploads((u) => u.map((x, j) => (j === k ? { ...x, status: 'uploading' } : x)));
      try {
        const r = await api.uploadBmsReport(list[k]);
        lastId = r.id;
        setUploads((u) => u.map((x, j) => (j === k ? { ...x, status: 'done', id: r.id, message: r.duplicate ? 'Already uploaded — opened the existing report' : 'Analyzed' } : x)));
      } catch (err) {
        setUploads((u) => u.map((x, j) => (j === k ? { ...x, status: 'error', message: err.message } : x)));
      }
    }
    await load();
    if (list.length === 1 && lastId) navigate(`/bms/${lastId}`);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>BMS Reports</h1>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Upload battery BMS logs (.xlsx from the online BMS) to get a summary, warnings and trends.
          </div>
        </div>
        <button onClick={onOpenSettings} disabled={!!settingsError} style={btnStyle()}><Settings2 size={14} /> Analysis settings</button>
      </div>

      {settingsError && <Banner level="critical" text={settingsError} />}

      {canUpload && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          style={{
            background: dragging ? '#2d5c2a33' : C.card, border: `1.5px dashed ${dragging ? C.green : C.border}`,
            borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: 16,
          }}
        >
          <Upload size={22} color={C.green} />
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 8 }}>Drop BMS log files here, or click to choose</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>.xlsx export from the BMS platform. Several files at once is fine.</div>
          <input ref={inputRef} type="file" accept=".xlsx" multiple hidden onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} />
        </div>
      )}

      {uploads.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 16, padding: 14 }}>
          {uploads.map((u, k) => (
            <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13, padding: '4px 0', flexWrap: 'wrap' }}>
              <span style={{ color: C.text, fontWeight: 600, wordBreak: 'break-all' }}>{u.name}</span>
              <span style={{ color: u.status === 'error' ? C.red : u.status === 'done' ? C.green : C.muted }}>
                {u.status === 'uploading' ? 'Uploading and analyzing…' : u.status === 'waiting' ? 'Waiting…' : u.message}
              </span>
              {u.id && <button onClick={() => navigate(`/bms/${u.id}`)} style={{ ...linkBtn, marginLeft: 'auto' }}>Open</button>}
            </div>
          ))}
        </div>
      )}

      {error && <Banner level="critical" text={error} />}

      <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
        <table style={{ ...tableStyle, minWidth: 960 }}>
          <thead>
            <tr>{['Battery', 'Period', 'Discharged', 'Charged', 'Peak out', 'Peak A', 'Max temp', 'Cell spread', 'SOH', 'Flags'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {!reports ? (
              <tr><td colSpan={10} style={{ padding: 32, textAlign: 'center', color: C.muted }}>{error ? '—' : 'Loading…'}</td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 32, textAlign: 'center', color: C.muted }}>No BMS logs uploaded yet</td></tr>
            ) : reports.map((r) => {
              const s = r.summary || {};
              return (
                <tr key={r.id} onClick={() => navigate(`/bms/${r.id}`)} style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}>
                  <td style={tdStyle}>
                    <div style={{ color: C.text, fontWeight: 600 }}>{r.label || r.device_model || 'Battery'}</div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{shortId(r.hwid)}</div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ color: C.text }}>{fmtDate(r.start_time)}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{fmt(s.hours, 'h')} · {r.row_count} readings</div>
                  </td>
                  <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>{fmt(s.discharge_kwh, 'kWh')}</td>
                  <td style={tdStyle}>{fmt(s.charge_kwh, 'kWh')}</td>
                  <td style={tdStyle}>{fmt(s.peak_discharge_kw, 'kW')}</td>
                  <td style={tdStyle}>{fmt(s.peak_discharge_a, 'A', 0)}</td>
                  <td style={tdStyle}>{fmt(s.max_temp_c, '°C', 0)}</td>
                  <td style={tdStyle}>{fmt(s.max_cell_spread_mv, 'mV', 0)}</td>
                  <td style={tdStyle}>{fmt(s.soh, '%')}</td>
                  <td style={tdStyle}><WarningCounts w={s.warnings} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- report detail ------------------------------------------------------------------

function ReportDetail({ id, version, onOpenSettings }) {
  const navigate = useNavigate();
  const profile = useProfile();
  const canEdit = profile?.role === 'admin' || profile?.role === 'operator';
  const isAdmin = profile?.role === 'admin';
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getBmsReport(id)
      .then((r) => { if (!cancelled) { setRes(r); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [id, version]);

  async function saveField(field, value) {
    const updated = await api.updateBmsReport(id, { [field]: value });
    setRes((r) => ({ ...r, report: { ...r.report, ...updated } }));
  }

  async function remove() {
    if (!window.confirm('Delete this BMS report? The uploaded data is removed.')) return;
    await api.deleteBmsReport(id);
    navigate('/bms');
  }

  const back = (
    <button onClick={() => navigate('/bms')} style={{ ...linkBtn, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
      <ArrowLeft size={14} /> All BMS reports
    </button>
  );

  if (error) return <>{back}<Banner level="critical" text={error} /></>;
  if (!res) return <>{back}<div style={{ color: C.muted }}>Analyzing…</div></>;

  const { report, analysis: a, previous } = res;
  const s = a.summary;
  const on = a.settings.sections;

  return (
    <>
      {back}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <EditableText
            value={report.label}
            placeholder={a.meta.device_model ? `${a.meta.device_model} battery` : 'Name this battery'}
            canEdit={canEdit}
            onSave={(v) => saveField('label', v)}
            style={{ fontSize: 22, fontWeight: 700, color: C.text }}
          />
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.7 }}>
            {fmtDate(s.start)} → {fmtDate(s.end)} · {fmt(s.hours, 'h')} · {s.samples} readings every {s.interval_s}s
            <br />
            {a.meta.nominal_v && `${a.meta.nominal_v} V · ${a.meta.capacity_ah} Ah · ${fmt(a.meta.nominal_kwh, 'kWh')} · `}
            {a.meta.device_model} · {a.meta.cell_count} cells · {a.meta.temp_sensor_count} temp sensors · HWID <code>{a.meta.hwid}</code>
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            Charging vehicles:
            <EditableText value={report.vehicle} placeholder="Set vehicle" canEdit={canEdit} onSave={(v) => saveField('vehicle', v)} style={{ fontSize: 13, color: C.text }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onOpenSettings} style={btnStyle()}><Settings2 size={14} /> Analysis settings</button>
          {isAdmin && <button onClick={remove} style={{ ...btnStyle(), color: C.red }}><Trash2 size={14} /> Delete</button>}
        </div>
      </div>

      {on.overview && <Overview s={s} limits={a.settings.limits} />}
      {on.warnings && <Warnings warnings={a.warnings} />}
      {on.comparison && <Comparison s={s} previous={previous} onOpen={(pid) => navigate(`/bms/${pid}`)} />}
      {on.events && <Events events={a.events} limits={a.settings.limits} />}
      {on.power_chart && <PowerCharts series={a.series} limits={a.settings.limits} />}
      {on.temperature && <TemperatureSection a={a} />}
      {on.temp_derating && <Derating derating={a.derating} />}
      {on.cells && <CellSection a={a} />}
      {on.cell_outliers && <Outliers a={a} />}
      {on.vehicles && <Vehicles a={a} vehicle={report.vehicle} />}
      {on.energy && <Energy s={s} />}
      {on.insulation && <Insulation a={a} />}
      {on.faults && <Faults a={a} />}
      {on.gaps && <Gaps gaps={a.gaps} />}

      <div style={{ fontSize: 11, color: C.muted, marginTop: 24 }}>
        File: {report.file_name} · uploaded {fmtDate(report.created_at)}{report.uploaded_by ? ` by ${report.uploaded_by}` : ''} · BMS software {a.meta.software_version || '—'}
      </div>
    </>
  );
}

// --- sections ---------------------------------------------------------------------

function Overview({ s, limits }) {
  return (
    <Section title="Overview">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Tile label="Energy out (discharge)" value={fmt(s.discharge_kwh)} unit="kWh" accent={C.s2} sub={`${s.discharge_sessions} session${s.discharge_sessions === 1 ? '' : 's'} · ${fmtMin(s.discharge_hours * 60)}`} />
        <Tile label="Energy in (charge)" value={fmt(s.charge_kwh)} unit="kWh" accent={C.s1} sub={`${s.charge_sessions} session${s.charge_sessions === 1 ? '' : 's'} · ${fmtMin(s.charge_hours * 60)}`} />
        <Tile label="Peak output" value={fmt(s.peak_discharge_kw)} unit="kW" sub={`avg ${fmt(s.avg_discharge_kw, 'kW')} · limit ${limits.system_kw} kW`} />
        <Tile label="Peak discharge current" value={fmt(s.peak_discharge_a, '', 0)} unit="A" sub={`limit ${limits.discharge_current_a} A`} />
        <Tile label="Peak input" value={fmt(s.peak_charge_kw)} unit="kW" sub={`avg ${fmt(s.avg_charge_kw, 'kW')} · ${fmt(s.peak_charge_a, 'A', 0)}`} />
        <Tile label="SOC range" value={`${fmt(s.soc_min, '', 0)}–${fmt(s.soc_max, '', 0)}`} unit="%" sub={`start ${fmt(s.soc_start, '%', 0)} · end ${fmt(s.soc_end, '%', 0)}`} />
        <Tile label="State of health" value={fmt(s.soh)} unit="%" />
        <Tile label="Cell temperature" value={`${fmt(s.min_temp_c, '', 0)}–${fmt(s.max_temp_c, '', 0)}`} unit="°C" sub={`max spread ${fmt(s.max_temp_spread_c, '°C', 0)}`} />
        <Tile label="Max cell spread" value={fmt(s.max_cell_spread_mv, '', 0)} unit="mV" sub={`cells ${fmt(s.min_cell_v, 'V', 3)}–${fmt(s.max_cell_v, 'V', 3)}`} />
        <Tile label="Warnings" value={<WarningCounts w={s.warnings} big />} />
      </div>
    </Section>
  );
}

function Warnings({ warnings }) {
  return (
    <Section title="Warnings" subtitle="What the analysis flagged in this log. Thresholds are in Analysis settings.">
      {warnings.length === 0 ? (
        <div style={{ color: C.green, fontSize: 13 }}>Nothing flagged — everything stayed within the configured limits.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {warnings.map((w, k) => {
            const L = LEVEL[w.level];
            return (
              <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: C.inner, border: `1px solid ${L.color}44`, borderRadius: 8, padding: '10px 12px' }}>
                <L.Icon size={15} color={L.color} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 700, marginRight: 6 }}>{L.label}</span>{w.message}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

const COMPARE_ROWS = [
  ['discharge_kwh', 'Energy out', 'kWh', null],
  ['charge_kwh', 'Energy in', 'kWh', null],
  ['peak_discharge_kw', 'Peak output', 'kW', null],
  ['avg_discharge_kw', 'Average output', 'kW', null],
  ['avg_charge_kw', 'Average input', 'kW', null],
  ['max_temp_c', 'Max cell temperature', '°C', 'lower'],
  ['max_temp_spread_c', 'Temperature spread', '°C', 'lower'],
  ['max_cell_spread_mv', 'Max cell spread', 'mV', 'lower'],
  ['min_cell_v', 'Lowest cell', 'V', 'higher'],
  ['soh', 'State of health', '%', 'higher'],
  ['min_insulation_kohm', 'Lowest insulation', 'kΩ', 'higher'],
];

function Comparison({ s, previous, onOpen }) {
  return (
    <Section title="Compared with previous report" subtitle={previous ? `Previous log from this battery: ${fmtDate(previous.start_time)}` : null}>
      {!previous ? (
        <div style={{ color: C.muted, fontSize: 13 }}>This is the first log uploaded for this battery. Upload more to see changes over time.</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead><tr>{['', 'This log', 'Previous', 'Change'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {COMPARE_ROWS.map(([key, label, unit, better]) => {
                  const a = n(s[key]); const b = n(previous.summary?.[key]);
                  const diff = a != null && b != null ? a - b : null;
                  const good = diff == null || diff === 0 || !better ? null : (better === 'lower') === diff < 0;
                  const digits = unit === 'V' ? 3 : 1;
                  return (
                    <tr key={key} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ ...tdStyle, color: C.text }}>{label}</td>
                      <td style={tdStyle}>{fmt(a, unit, digits)}</td>
                      <td style={tdStyle}>{fmt(b, unit, digits)}</td>
                      <td style={{ ...tdStyle, color: good == null ? C.muted : good ? C.green : C.amber, fontWeight: 600 }}>
                        {diff == null ? '—' : `${diff > 0 ? '+' : ''}${fmt(diff, unit, digits)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button onClick={() => onOpen(previous.id)} style={{ ...linkBtn, marginTop: 10 }}>Open previous report</button>
        </>
      )}
    </Section>
  );
}

function Events({ events, limits }) {
  return (
    <Section title="Charge and discharge sessions" subtitle={`Discharge = battery feeding the DC-DC chargers (vehicles). Charge = AC-DC charger refilling the battery. Short pauses are joined into one session.`}>
      {events.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No charging or discharging in this log.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ ...tableStyle, minWidth: 1100 }}>
            <thead>
              <tr>{['Type', 'Start', 'Duration', 'Energy', 'Avg kW', 'Peak kW', 'Avg A', 'Peak A', 'SOC', 'Temp', 'Min cell', 'Spread', 'Notes'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {events.map((e, k) => {
                const notes = [];
                if (e.interruptions) notes.push(`${e.interruptions} restart${e.interruptions === 1 ? '' : 's'}`);
                if (e.minutes_at_current_limit) notes.push(`${fmtMin(e.minutes_at_current_limit)} at ${limits.discharge_current_a} A limit`);
                if (e.minutes_over_power_limit) notes.push(`${fmtMin(e.minutes_over_power_limit)} over ${e.type === 'discharge' ? limits.system_kw : limits.charger_kw} kW`);
                if (e.type === 'charge' && e.requested_a) notes.push(`requested ${e.requested_v} V / ${e.requested_a} A (${fmt(e.delivered_vs_requested_pct, '%', 0)} delivered)`);
                if (e.type === 'discharge' && e.vehicle_sessions_est) notes.push(`≈ ${e.vehicle_sessions_est} vehicle charges`);
                return (
                  <tr key={k} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={tdStyle}><TypePill type={e.type} /></td>
                    <td style={tdStyle}>{fmtDate(e.start)}</td>
                    <td style={tdStyle}>{fmtMin(e.duration_min)}</td>
                    <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>{fmt(e.energy_kwh, 'kWh')}</td>
                    <td style={tdStyle}>{fmt(e.avg_kw)}</td>
                    <td style={tdStyle}>{fmt(e.peak_kw)}</td>
                    <td style={tdStyle}>{fmt(e.avg_a, '', 0)}</td>
                    <td style={tdStyle}>{fmt(e.peak_a, '', 0)}</td>
                    <td style={tdStyle}>{fmt(e.soc_start, '', 0)} → {fmt(e.soc_end, '%', 0)}</td>
                    <td style={tdStyle}>{fmt(e.temp_start_c, '', 0)} → {fmt(e.temp_max_c, '°C', 0)}</td>
                    <td style={tdStyle}>{fmt(e.min_cell_v, 'V', 3)}</td>
                    <td style={tdStyle}>{e.max_cell_spread_v != null ? fmt(e.max_cell_spread_v * 1000, 'mV', 0) : '—'}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', minWidth: 220, fontSize: 12 }}>{notes.join(' · ') || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function PowerCharts({ series, limits }) {
  return (
    <Section title="Power and state of charge" subtitle="Power: above zero = charging the battery, below zero = discharging to vehicles.">
      <ChartBox title="Power (kW)" height={220}>
        <AreaChart data={series} margin={chartMargin}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis {...timeAxis} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={50} />
          <ReferenceLine y={0} stroke={C.muted} />
          <ReferenceLine y={-limits.system_kw} stroke={C.muted} strokeDasharray="4 4" label={{ value: `${limits.system_kw} kW rating`, fill: C.muted, fontSize: 10, position: 'insideBottomLeft' }} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDate} formatter={(v, _k, item) => [`${fmt(v, 'kW')} · ${fmt(item.payload.a, 'A', 0)}`, 'Power']} />
          <Area type="stepAfter" dataKey="kw" stroke={C.s1} strokeWidth={1.5} fill={C.s1} fillOpacity={0.18} isAnimationActive={false} />
        </AreaChart>
      </ChartBox>
      <ChartBox title="State of charge (%)" height={160}>
        <LineChart data={series} margin={chartMargin}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis {...timeAxis} />
          <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} width={50} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDate} formatter={(v) => [fmt(v, '%'), 'SOC']} />
          <Line type="monotone" dataKey="soc" stroke={C.s3} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartBox>
    </Section>
  );
}

function TemperatureSection({ a }) {
  const e = a.extremes;
  return (
    <Section title="Temperature" subtitle="Higher temperatures make the BMS reduce the allowed current, so output drops as the pack heats up.">
      <ChartBox title="Cell temperature (°C)" height={220}>
        <LineChart data={a.series} margin={chartMargin}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis {...timeAxis} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={50} domain={['dataMin - 2', 'dataMax + 2']} />
          <ReferenceLine y={a.settings.thresholds.temp_warn_c} stroke={C.amber} strokeDasharray="4 4" ifOverflow="hidden" />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDate} formatter={(v, name) => [fmt(v, '°C', 0), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
          <Line name="Hottest sensor" type="monotone" dataKey="max_t" stroke={C.s2} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line name="Average" type="monotone" dataKey="avg_t" stroke={C.s3} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line name="Coolest sensor" type="monotone" dataKey="min_t" stroke={C.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartBox>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
        <Fact label="Hottest reading" value={e.max_temp ? `${e.max_temp.value}°C on sensor #${e.max_temp.sensor}` : '—'} sub={e.max_temp ? `${fmtDate(e.max_temp.t)} · SOC ${e.max_temp.soc}% · ${e.max_temp.state}` : ''} />
        <Fact label="Coolest reading" value={e.min_temp ? `${e.min_temp.value}°C on sensor #${e.min_temp.sensor}` : '—'} sub={e.min_temp ? `${fmtDate(e.min_temp.t)} · ${e.min_temp.state}` : ''} />
        <Fact label="Largest temperature spread" value={fmt(a.summary.max_temp_spread_c, '°C', 0)} sub="Hottest vs coolest sensor at the same moment" />
      </div>
    </Section>
  );
}

function Derating({ derating }) {
  const dis = derating.find((x) => x.type === 'discharge');
  const chg = derating.find((x) => x.type === 'charge');
  return (
    <Section title="Temperature vs power" subtitle="Average power and current at each hottest-cell temperature. Falling bars at higher temperatures show thermal derating. SOC also affects current, so compare across several logs.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
        {[['Discharging', dis, C.s2], ['Charging', chg, C.s1]].map(([title, d, color]) => (
          <div key={title}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{title}</div>
            {!d?.bands?.length ? <div style={{ color: C.muted, fontSize: 13 }}>No {title.toLowerCase()} in this log.</div> : (
              <>
                <div style={{ height: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.bands} margin={chartMargin}>
                      <CartesianGrid stroke={C.border} vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                      <YAxis tick={axisTick} axisLine={false} tickLine={false} width={50} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff0d' }} formatter={(v, _k, item) => [`${fmt(v, 'kW')} · ${fmt(item.payload.avg_a, 'A', 0)} · ${item.payload.samples} readings`, 'Average']} />
                      <Bar dataKey="avg_kw" fill={color} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table style={{ ...tableStyle, marginTop: 6 }}>
                  <thead><tr>{['Temp', 'Avg kW', 'Avg A', 'Readings'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>{d.bands.map((b) => (
                    <tr key={b.label} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ ...tdStyle, color: C.text }}>{b.label}</td><td style={tdStyle}>{fmt(b.avg_kw)}</td><td style={tdStyle}>{fmt(b.avg_a, '', 0)}</td><td style={tdStyle}>{b.samples}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function CellSection({ a }) {
  const e = a.extremes;
  return (
    <Section title="Cell voltages" subtitle={`${a.cells.count} cells. A wide spread between the highest and lowest cell means the pack is out of balance.`}>
      <ChartBox title="Highest and lowest cell (V)" height={200}>
        <LineChart data={a.series} margin={chartMargin}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis {...timeAxis} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={50} domain={['dataMin - 0.02', 'dataMax + 0.02']} tickFormatter={(v) => v.toFixed(2)} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDate} formatter={(v, name) => [fmt(v, 'V', 3), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
          <Line name="Highest cell" type="monotone" dataKey="max_cell_v" stroke={C.s2} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line name="Lowest cell" type="monotone" dataKey="min_cell_v" stroke={C.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartBox>
      <ChartBox title="Cell spread (mV)" height={150}>
        <AreaChart data={a.series} margin={chartMargin}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis {...timeAxis} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={50} />
          <ReferenceLine y={a.settings.thresholds.cell_spread_warn_v * 1000} stroke={C.amber} strokeDasharray="4 4" ifOverflow="extendDomain" />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDate} formatter={(v) => [fmt(v, 'mV', 0), 'Spread']} />
          <Area type="monotone" dataKey="spread_mv" stroke={C.s3} strokeWidth={1.5} fill={C.s3} fillOpacity={0.18} isAnimationActive={false} />
        </AreaChart>
      </ChartBox>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
        <Fact label="Highest cell" value={e.max_cell ? `${e.max_cell.value} V (cell #${e.max_cell.cell})` : '—'} sub={e.max_cell ? `${fmtDate(e.max_cell.t)} · SOC ${e.max_cell.soc}% · ${e.max_cell.state}` : ''} />
        <Fact label="Lowest cell" value={e.min_cell ? `${e.min_cell.value} V (cell #${e.min_cell.cell})` : '—'} sub={e.min_cell ? `${fmtDate(e.min_cell.t)} · SOC ${e.min_cell.soc}% · ${e.min_cell.state}` : ''} />
        <Fact label="Largest spread" value={e.max_spread ? `${e.max_spread.value_mv} mV` : '—'} sub={e.max_spread ? `${fmtDate(e.max_spread.t)} · SOC ${e.max_spread.soc}% · ${e.max_spread.state}` : ''} />
        <Fact label="Balancing active" value={`${a.cells.balancing_pct}% of readings`} sub="BMS bleeding charge from high cells to even them out" />
      </div>
    </Section>
  );
}

function Outliers({ a }) {
  return (
    <Section title="Weak cells and hot spots" subtitle="Cells that sit below the pack average and sensors that run hotter than the rest. A cell that keeps showing up here across reports is worth inspecting.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Lowest cells (vs pack average)</div>
          <table style={tableStyle}>
            <thead><tr>{['Cell', 'Avg vs pack', 'Lowest cell in', 'Range'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{a.cells.weakest.map((c) => (
              <tr key={c.n} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>#{c.n}</td>
                <td style={tdStyle}>{fmt(c.avg_dev_mv, 'mV', 1)}</td>
                <td style={tdStyle}>{fmt(c.lowest_pct, '%', 1)} of readings</td>
                <td style={tdStyle}>{fmt(c.min_mv / 1000, 'V', 3)} – {fmt(c.max_mv / 1000, 'V', 3)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Hottest temperature sensors (vs pack average)</div>
          <table style={tableStyle}>
            <thead><tr>{['Sensor', 'Avg vs pack', 'Hottest in', 'Max'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{a.temps.hottest.map((t) => (
              <tr key={t.n} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>#{t.n}</td>
                <td style={tdStyle}>+{fmt(t.avg_dev_c, '°C', 1)}</td>
                <td style={tdStyle}>{fmt(t.hottest_pct, '%', 1)} of readings</td>
                <td style={tdStyle}>{fmt(t.max_c, '°C', 0)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function Vehicles({ a, vehicle }) {
  const L = a.settings.limits;
  const dis = a.events.filter((e) => e.type === 'discharge');
  return (
    <Section title="Vehicles served" subtitle={`Estimate from energy discharged ÷ ${L.vehicle_session_kwh} kWh per ${vehicle || L.vehicle_name} charge (set in Analysis settings). Several vehicles can charge at once from one discharge session.`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Tile label={`≈ ${vehicle || L.vehicle_name} charges`} value={fmt(a.summary.vehicle_sessions_est)} />
        <Tile label="Discharge sessions" value={dis.length} />
        <Tile label="Energy delivered" value={fmt(a.summary.discharge_kwh)} unit="kWh" />
        <Tile label="Average output" value={fmt(a.summary.avg_discharge_kw)} unit="kW" />
      </div>
    </Section>
  );
}

function Energy({ s }) {
  return (
    <Section title="Lifetime energy" subtitle="From the BMS's own lifetime counters. Period values are the counter change across this log, a cross-check on the calculated energy above.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Tile label="Lifetime discharged" value={fmt(s.lifetime_discharge_kwh != null ? s.lifetime_discharge_kwh / 1000 : null, '', 1)} unit="MWh" />
        <Tile label="Lifetime charged" value={fmt(s.lifetime_charge_kwh != null ? s.lifetime_charge_kwh / 1000 : null, '', 1)} unit="MWh" />
        <Tile label="Equivalent full cycles" value={fmt(s.equivalent_full_cycles, '', 0)} sub={s.nominal_kwh ? `at ${fmt(s.nominal_kwh, 'kWh')} per cycle` : ''} />
        <Tile label="Discharged this log (counter)" value={fmt(s.period_discharge_kwh)} unit="kWh" sub={`calculated ${fmt(s.discharge_kwh, 'kWh')}`} />
        <Tile label="Charged this log (counter)" value={fmt(s.period_charge_kwh)} unit="kWh" sub={`calculated ${fmt(s.charge_kwh, 'kWh')}`} />
        <Tile label="Lifetime charge ÷ discharge" value={s.lifetime_discharge_kwh ? fmt((s.lifetime_charge_kwh / s.lifetime_discharge_kwh) * 100, '', 1) : '—'} unit="%" sub="Energy put in per kWh taken out" />
      </div>
    </Section>
  );
}

function Insulation({ a }) {
  const e = a.extremes.min_insulation;
  const s = a.summary;
  const T = a.settings.thresholds;
  return (
    <Section title="Insulation and 12 V supply" subtitle={`Insulation resistance between the high-voltage system and chassis. Warning below ${T.insulation_warn_ohm_per_v} Ω/V, critical below ${T.insulation_crit_ohm_per_v} Ω/V. 65,535 kΩ means "above the measurable range".`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Fact label="Lowest insulation" value={e?.value_kohm != null ? `${fmt(e.value_kohm, 'kΩ', 0)} (${fmt(e.ohm_per_v, 'Ω/V', 0)})` : 'Always above range'} sub={e?.t ? `${fmtDate(e.t)} · ${e.state}` : ''} />
        <Fact label="Lowest 12 V supply" value={fmt(s.min_supply_v, 'V', 2)} sub={`Warning below ${T.supply_low_v} V`} />
      </div>
    </Section>
  );
}

function Faults({ a }) {
  return (
    <Section title="Faults and snapshots">
      {a.faults.length === 0 && !a.summary.snapshot_rows ? (
        <div style={{ color: C.green, fontSize: 13 }}>No fault codes, charger faults or fault snapshots in this log.</div>
      ) : (
        <>
          {a.summary.snapshot_rows > 0 && <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>{a.summary.snapshot_rows} fault-snapshot readings (the BMS records 10 s before and after a fault).</div>}
          <table style={tableStyle}>
            <thead><tr>{['Fault', 'Code', 'Level', 'First seen', 'Readings', 'SOC'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{a.faults.map((f, k) => (
              <tr key={k} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...tdStyle, color: C.text }}>{f.name || '—'}</td><td style={tdStyle}>{f.code || '—'}</td><td style={tdStyle}>{f.level || '—'}</td>
                <td style={tdStyle}>{fmtDate(f.first_t)}</td><td style={tdStyle}>{f.samples}</td><td style={tdStyle}>{fmt(f.soc, '%', 0)}</td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}
    </Section>
  );
}

function Gaps({ gaps }) {
  return (
    <Section title="Data gaps" subtitle="Periods with no readings: the battery was powered down, out of signal, or not reporting.">
      {gaps.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No gaps — the log is continuous.</div> : (
        <table style={tableStyle}>
          <thead><tr>{['From', 'To', 'Length', 'SOC before → after'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>{gaps.map((g, k) => (
            <tr key={k} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={tdStyle}>{fmtDate(g.from)}</td><td style={tdStyle}>{fmtDate(g.to)}</td><td style={tdStyle}>{fmtMin(g.minutes)}</td>
              <td style={tdStyle}>{fmt(g.soc_before, '%', 0)} → {fmt(g.soc_after, '%', 0)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Section>
  );
}

// --- settings panel --------------------------------------------------------------------

function SettingsPanel({ settings, defaults, onClose, onSaved }) {
  const profile = useProfile();
  const canEdit = profile?.role === 'admin' || profile?.role === 'operator';
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(settings)));
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  function setVal(group, key, value) {
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    // Numbers come back from inputs as strings; keep text fields as text.
    const clean = JSON.parse(JSON.stringify(draft));
    for (const g of ['limits', 'thresholds', 'events']) {
      for (const [k, v] of Object.entries(clean[g])) {
        if (k === 'vehicle_name') continue;
        clean[g][k] = v === '' || v == null ? null : Number(v);
      }
    }
    try {
      const r = await api.saveBmsSettings(clean);
      onSaved(r.settings);
      onClose();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  const allOn = SECTIONS.every(([k]) => draft.sections[k]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(100%, 520px)', height: '100%', background: C.card, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Analysis settings</div>
            <div style={{ fontSize: 12, color: C.muted }}>Shared by everyone. Applies to every report, including ones already uploaded.</div>
          </div>
          <button onClick={onClose} style={{ ...linkBtn, color: C.muted }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <SettingsGroup title="Show these sections">
            <label style={checkRow}>
              <input type="checkbox" checked={allOn} disabled={!canEdit}
                onChange={(e) => setDraft((d) => ({ ...d, sections: Object.fromEntries(SECTIONS.map(([k]) => [k, e.target.checked])) }))} />
              <span style={{ fontWeight: 600 }}>All sections</span>
            </label>
            {SECTIONS.map(([key, label, desc]) => (
              <label key={key} style={checkRow}>
                <input type="checkbox" checked={!!draft.sections[key]} disabled={!canEdit} onChange={(e) => setVal('sections', key, e.target.checked)} />
                <span>
                  <span style={{ display: 'block' }}>{label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.muted }}>{desc}</span>
                </span>
              </label>
            ))}
          </SettingsGroup>

          <SettingsGroup title="System limits">
            <NumberGrid fields={LIMIT_FIELDS} group="limits" draft={draft} defaults={defaults} setVal={setVal} disabled={!canEdit} />
          </SettingsGroup>
          <SettingsGroup title="Warning thresholds">
            <NumberGrid fields={THRESHOLD_FIELDS} group="thresholds" draft={draft} defaults={defaults} setVal={setVal} disabled={!canEdit} />
          </SettingsGroup>
          <SettingsGroup title="Session detection">
            <NumberGrid fields={EVENT_FIELDS} group="events" draft={draft} defaults={defaults} setVal={setVal} disabled={!canEdit} />
          </SettingsGroup>
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit ? (
            <>
              <button onClick={save} disabled={saving} style={btnStyle(true)}>{saving ? 'Saving…' : 'Save settings'}</button>
              <button onClick={() => setDraft(JSON.parse(JSON.stringify(defaults)))} style={btnStyle()}>Reset to defaults</button>
            </>
          ) : <span style={{ fontSize: 12, color: C.muted }}>Only admins and operators can change these.</span>}
          {msg && <span style={{ fontSize: 12, color: C.red }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

function SettingsGroup({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function NumberGrid({ fields, group, draft, defaults, setVal, disabled }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
      {fields.map(([key, label, unit]) => (
        <label key={key} style={{ display: 'block' }}>
          <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>{label}{unit && <span style={{ color: C.muted }}> ({unit})</span>}</div>
          <input
            type={key === 'vehicle_name' ? 'text' : 'number'}
            step="any"
            disabled={disabled}
            value={draft[group][key] ?? ''}
            placeholder={defaults?.[group]?.[key] != null ? String(defaults[group][key]) : ''}
            onChange={(e) => setVal(group, key, e.target.value)}
            style={inputStyle}
          />
        </label>
      ))}
    </div>
  );
}

// --- small pieces ----------------------------------------------------------------------

function Section({ title, subtitle, children }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 3, marginBottom: 12, lineHeight: 1.45 }}>{subtitle}</div>}
      {!subtitle && <div style={{ height: 12 }} />}
      {children}
    </div>
  );
}

function ChartBox({ title, height, children }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{title}</div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

function Tile({ label, value, unit, sub, accent }) {
  return (
    <div style={{ background: C.inner, borderRadius: 10, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
        {accent && <span style={{ width: 4, height: 16, borderRadius: 2, background: accent, flexShrink: 0 }} />}
        <span>{value}{unit && <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginLeft: 4 }}>{unit}</span>}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Fact({ label, value, sub }) {
  return (
    <div style={{ background: C.inner, borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function TypePill({ type }) {
  const dis = type === 'discharge';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: C.text }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: dis ? C.s2 : C.s1 }} />
      {dis ? 'Discharge' : 'Charge'}
    </span>
  );
}

function WarningCounts({ w, big }) {
  if (!w) return <span style={{ color: C.muted }}>—</span>;
  const items = [['critical', w.critical], ['warning', w.warning], ['info', w.info]].filter(([, c]) => c > 0);
  if (!items.length) return <span style={{ color: C.green, fontSize: big ? 16 : 12, fontWeight: 600 }}>None</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map(([lvl, c]) => (
        <span key={lvl} title={LEVEL[lvl].label} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: big ? 14 : 11, fontWeight: 700, color: C.text,
          border: `1px solid ${LEVEL[lvl].color}66`, background: `${LEVEL[lvl].color}1a`, borderRadius: 999, padding: big ? '2px 10px' : '1px 7px',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: LEVEL[lvl].color }} />{c} {LEVEL[lvl].label.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

function EditableText({ value, placeholder, canEdit, onSave, style }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || '');
  const [err, setErr] = useState(null);
  if (editing) {
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }}
          style={{ ...inputStyle, ...style, padding: '4px 8px', width: 'auto', minWidth: 200 }} />
        <button onMouseDown={async () => { try { await onSave(text); setEditing(false); } catch (e) { setErr(e.message); } }} style={linkBtn}><Check size={16} /></button>
        <button onMouseDown={() => setEditing(false)} style={{ ...linkBtn, color: C.muted }}><X size={16} /></button>
        {err && <span style={{ fontSize: 12, color: C.red }}>{err}</span>}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <span style={{ ...style, color: value ? style.color : C.muted }}>{value || placeholder}</span>
      {canEdit && <button onClick={() => { setText(value || ''); setEditing(true); }} style={{ ...linkBtn, color: C.muted }} title="Edit"><Pencil size={13} /></button>}
    </span>
  );
}

function Banner({ level, text }) {
  const L = LEVEL[level];
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: `${L.color}1a`, border: `1px solid ${L.color}55`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text, marginBottom: 16 }}>
      <L.Icon size={14} color={L.color} /> {text}
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

const linkBtn = { background: 'none', border: 'none', padding: 0, color: C.green, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { padding: '9px 10px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' };
const tdStyle = { padding: '9px 10px', color: C.muted, whiteSpace: 'nowrap' };
const inputStyle = { width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none' };
const checkRow = { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: C.text, padding: '6px 0', cursor: 'pointer' };
const tooltipStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text };
const axisTick = { fill: C.muted, fontSize: 11 };
const chartMargin = { top: 6, right: 8, bottom: 0, left: 0 };
const timeAxis = { dataKey: 't', type: 'number', scale: 'time', domain: ['dataMin', 'dataMax'], tickFormatter: fmtTime, tick: axisTick, axisLine: false, tickLine: false, minTickGap: 40 };
