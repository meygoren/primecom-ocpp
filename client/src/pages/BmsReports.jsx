import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, Settings2, ArrowLeft, Trash2, X, Pencil, Check, FileDown, KeyRound, Languages } from 'lucide-react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';
import { makeT } from '../lib/bmsI18n';
import { ReportBody, WarningCounts } from '../components/bms/BmsSections';
import { C, LEVEL, ReportProvider, fmt, fmtDate, btnStyle, linkBtn, cardStyle, tableStyle, thStyle, tdStyle } from '../lib/bmsUi';
import { TeamNotes, ClaudeAnalysis, ClaudeChat, ClaudeSettingsPanel } from '../components/bms/BmsClaude';

// BMS Reports: upload the .xlsx log exported from the Primecom battery's
// online BMS and read the analysis. The analysis itself is done on the server
// (server/services/bmsAnalyzer.js) and re-run with the current settings each
// time a report is opened. Reports can be shown and exported in English or
// Chinese, and discussed with Claude.

const SECTIONS = [
  ['overview', 'Overview tiles', 'Energy in/out, peak and average power, SOC, SOH, temperatures'],
  ['warnings', 'Warnings', 'Everything the analysis flagged, most serious first'],
  ['comparison', 'Compared with previous log', 'Changes since the last log from the same battery'],
  ['trend', 'Trend across logs', 'Day-by-day direction of each metric across every log for the battery'],
  ['notes', 'Team notes', 'Your own observations about the log'],
  ['ai_analysis', 'Claude analysis', "Claude's written review of the log"],
  ['chat', 'Ask Claude', 'Chat with Claude about the log'],
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


function shortId(id) { return id ? `${String(id).slice(0, 6)}…${String(id).slice(-4)}` : '—'; }
const enT = makeT('en');

// --- page -------------------------------------------------------------------

export default function BmsReports() {
  const { id } = useParams();
  const profile = useProfile();
  const [settings, setSettings] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [showAi, setShowAi] = useState(false);
  const [version, setVersion] = useState(0); // bump to reload the report after settings change

  useEffect(() => {
    api.getBmsSettings()
      .then((r) => { setSettings(r.settings); setDefaults(r.defaults); })
      .catch((err) => setSettingsError(err.message));
    api.getAiSettings().then(setAiStatus).catch(() => setAiStatus(null));
  }, []);

  const headerButtons = (
    <>
      <button onClick={() => setShowAi(true)} style={btnStyle()}><KeyRound size={14} /> Claude settings</button>
      <button onClick={() => setShowSettings(true)} disabled={!settings} style={btnStyle()}><Settings2 size={14} /> Analysis settings</button>
    </>
  );

  return (
    <div style={{ padding: '28px clamp(16px, 3vw, 36px)', maxWidth: 1280 }}>
      {id ? (
        <ReportDetail id={id} version={version} aiStatus={aiStatus} headerButtons={headerButtons} />
      ) : (
        <ReportList headerButtons={headerButtons} settingsError={settingsError} />
      )}
      {showSettings && settings && (
        <SettingsPanel
          settings={settings}
          defaults={defaults}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => { setSettings(s); setVersion((v) => v + 1); }}
        />
      )}
      {showAi && (
        <ClaudeSettingsPanel status={aiStatus} isAdmin={profile?.role === 'admin'} onClose={() => setShowAi(false)} onSaved={setAiStatus} />
      )}
    </div>
  );
}

// --- list + upload ------------------------------------------------------------

function ReportList({ headerButtons, settingsError }) {
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{headerButtons}</div>
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
          <Upload size={22} color={C.green} style={{ display: 'block', margin: '0 auto' }} />
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
                  <td style={tdStyle}><ReportProvider value={{ t: enT, lang: 'en', print: false }}><WarningCounts w={s.warnings} /></ReportProvider></td>
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

function ReportDetail({ id, version, aiStatus, headerButtons }) {
  const navigate = useNavigate();
  const profile = useProfile();
  const canEdit = profile?.role === 'admin' || profile?.role === 'operator';
  const isAdmin = profile?.role === 'admin';
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('bms_lang') === 'zh' ? 'zh' : 'en'; } catch { return 'en'; }
  });
  const t = makeT(lang);

  useEffect(() => {
    let cancelled = false;
    api.getBmsReport(id)
      .then((r) => { if (!cancelled) { setRes(r); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [id, version]);

  function switchLang(l) {
    setLang(l);
    try { localStorage.setItem('bms_lang', l); } catch { /* storage unavailable */ }
  }

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
      <ArrowLeft size={14} /> {t('all_reports')}
    </button>
  );

  if (error) return <>{back}<Banner level="critical" text={error} /></>;
  if (!res) return <>{back}<div style={{ color: C.muted }}>{t('analyzing')}</div></>;

  const { report, analysis: a } = res;
  const s = a.summary;
  const on = a.settings.sections;
  const aiReady = !!aiStatus?.configured;
  const setReport = (patch) => setRes((r) => ({ ...r, report: { ...r.report, ...patch } }));

  const extras = (
    <>
      {on.notes !== false && <TeamNotes report={report} canEdit={canEdit} onSaved={(notes) => setReport({ notes })} />}
      {on.ai_analysis !== false && <ClaudeAnalysis report={report} aiReady={aiReady} canEdit={canEdit} onSaved={(ai_analysis) => setReport({ ai_analysis })} />}
      {on.chat !== false && <ClaudeChat reportId={report.id} aiReady={aiReady} canEdit={canEdit} />}
    </>
  );

  return (
    <ReportProvider value={{ t, lang, print: false }}>
      {back}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <EditableText
            value={report.label}
            placeholder={a.meta.device_model ? t('battery_suffix', { model: a.meta.device_model }) : t('name_battery')}
            canEdit={canEdit}
            onSave={(v) => saveField('label', v)}
            style={{ fontSize: 22, fontWeight: 700, color: C.text }}
          />
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.7 }}>
            {fmtDate(s.start, lang)} → {fmtDate(s.end, lang)} · {fmt(s.hours, 'h')} · {t('readings_every', { n: s.samples, s: s.interval_s })}
            <br />
            {a.meta.nominal_v && `${a.meta.nominal_v} V · ${a.meta.capacity_ah} Ah · ${fmt(a.meta.nominal_kwh, 'kWh')} · `}
            {a.meta.device_model} · {t('n_cells', { n: a.meta.cell_count })} · {t('n_temp_sensors', { n: a.meta.temp_sensor_count })} · HWID <code>{a.meta.hwid}</code>
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {t('charging_vehicles')}
            <EditableText value={report.vehicle} placeholder={t('set_vehicle')} canEdit={canEdit} onSave={(v) => saveField('vehicle', v)} style={{ fontSize: 13, color: C.text }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <LangSwitch lang={lang} onChange={switchLang} />
          <button onClick={() => setShowExport(true)} style={btnStyle(true)}><FileDown size={14} /> {t('export_pdf')}</button>
          {headerButtons}
          {isAdmin && <button onClick={remove} style={{ ...btnStyle(), color: C.red }}><Trash2 size={14} /> {t('delete')}</button>}
        </div>
      </div>

      <ReportBody data={res} onOpenReport={(pid) => navigate(`/bms/${pid}`)} extras={extras} />

      <div style={{ fontSize: 11, color: C.muted, marginTop: 24 }}>
        {t('file_line', { file: report.file_name, date: fmtDate(report.created_at, lang), by: report.uploaded_by ? t('by', { u: report.uploaded_by }) : '', sw: a.meta.software_version || '—' })}
      </div>

      {showExport && <ExportDialog report={report} initialLang={lang} onClose={() => setShowExport(false)} />}
    </ReportProvider>
  );
}

function LangSwitch({ lang, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }} title="Report language">
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 8px', background: C.inner, color: C.muted }}><Languages size={14} /></span>
      {[['en', 'EN'], ['zh', '中文']].map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} style={{
          background: lang === id ? '#2d5c2a55' : C.inner, color: lang === id ? C.green : C.muted,
          border: 'none', borderLeft: `1px solid ${C.border}`, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>{label}</button>
      ))}
    </div>
  );
}

// Export: PDF (print view) or the raw readings as CSV, in English or Chinese.
function ExportDialog({ report, initialLang, onClose }) {
  const [lang, setLang] = useState(initialLang);
  const [withAi, setWithAi] = useState(true);
  const [withNotes, setWithNotes] = useState(true);
  const [withChat, setWithChat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const hasAi = !!report.ai_analysis?.[lang];

  function openPdf() {
    const q = new URLSearchParams({ lang, ai: withAi && hasAi ? '1' : '0', notes: withNotes ? '1' : '0', chat: withChat ? '1' : '0' });
    window.open(`/bms/${report.id}/print?${q}`, '_blank', 'noopener');
    onClose();
  }

  async function downloadCsv() {
    setBusy(true);
    setErr(null);
    try {
      const { blob, filename } = await api.downloadBmsReadings(report.id, lang);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(100%, 460px)', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Export report</div>
          <button onClick={onClose} style={{ ...linkBtn, color: C.muted }}><X size={18} /></button>
        </div>

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Language</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['en', 'English'], ['zh', '中文 (Chinese)']].map(([id, label]) => (
            <button key={id} onClick={() => setLang(id)} style={{ ...btnStyle(lang === id), flex: 1, justifyContent: 'center' }}>{label}</button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>PDF includes every section shown on the page, plus:</div>
        <label style={checkRow}>
          <input type="checkbox" checked={withAi && hasAi} disabled={!hasAi} onChange={(e) => setWithAi(e.target.checked)} />
          <span>
            Claude analysis
            {!hasAi && <span style={{ display: 'block', fontSize: 11, color: C.muted }}>Not generated in {lang === 'zh' ? 'Chinese' : 'English'} yet — switch the page to {lang === 'zh' ? '中文' : 'EN'} and press Generate analysis.</span>}
          </span>
        </label>
        <label style={checkRow}><input type="checkbox" checked={withNotes} onChange={(e) => setWithNotes(e.target.checked)} /> Team notes</label>
        <label style={checkRow}><input type="checkbox" checked={withChat} onChange={(e) => setWithChat(e.target.checked)} /> Claude conversation</label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button onClick={openPdf} style={btnStyle(true)}><FileDown size={14} /> Open PDF</button>
          <button onClick={downloadCsv} disabled={busy} style={btnStyle()}><FileDown size={14} /> {busy ? 'Preparing…' : 'Readings (CSV)'}</button>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
          The PDF opens in a new tab with the print dialog — choose "Save as PDF". The CSV has every BMS reading in the log (time, SOC, voltage, current, power, cells, temperatures, charger, faults).
        </div>
        {err && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{err}</div>}
      </div>
    </div>
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


const inputStyle = { width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none' };
const checkRow = { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: C.text, padding: '6px 0', cursor: 'pointer' };
