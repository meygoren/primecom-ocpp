import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:     '#0f1117',
  card:   '#1a1d27',
  panel:  '#22263a',
  border: '#2e3347',
  text:   '#f1f5f9',
  muted:  '#8892a4',
  green:  '#47a141',
  blue:   '#3b82f6',
  amber:  '#f59e0b',
  red:    '#ef4444',
  purple: '#a855f7',
};

const PERIODS = [
  { key: 'daily',   label: 'Daily'   },
  { key: 'weekly',  label: 'Weekly'  },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly',  label: 'Yearly'  },
];

// ── Demo data generator ───────────────────────────────────────────────────────
function makeDemoData(period) {
  const now = new Date();
  const rows = [];

  if (period === 'daily') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const kwh       = 420 + Math.sin(i * 0.7) * 120 + (Math.random() - 0.5) * 80;
      const sessions  = Math.round(kwh / 55);
      const energy_rev = kwh * 0.5;
      const showup_rev = 150;
      rows.push({ date: d.toISOString().slice(0, 10), kwh, sessions, energy_rev, showup_rev, total_rev: energy_rev + showup_rev });
    }
  } else if (period === 'weekly') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i * 7);
      const kwh       = (3200 + Math.sin(i * 0.5) * 600 + (Math.random() - 0.5) * 400);
      const sessions  = Math.round(kwh / 55);
      const energy_rev = kwh * 0.5;
      const showup_rev = 150 * 5;
      rows.push({ date: d.toISOString().slice(0, 10), kwh, sessions, energy_rev, showup_rev, total_rev: energy_rev + showup_rev });
    }
  } else if (period === 'monthly') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const kwh       = 14000 + Math.sin(i * 0.6) * 3000 + (Math.random() - 0.5) * 2000;
      const sessions  = Math.round(kwh / 55);
      const energy_rev = kwh * 0.5;
      const showup_rev = 150 * 22;
      rows.push({ date: d.toISOString().slice(0, 7), kwh, sessions, energy_rev, showup_rev, total_rev: energy_rev + showup_rev });
    }
  } else {
    for (let i = 23; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const kwh       = 14500 + Math.sin(i * 0.4) * 3200 + (Math.random() - 0.5) * 2500;
      const sessions  = Math.round(kwh / 55);
      const energy_rev = kwh * 0.5;
      const showup_rev = 150 * 22;
      rows.push({ date: d.toISOString().slice(0, 7), kwh, sessions, energy_rev, showup_rev, total_rev: energy_rev + showup_rev });
    }
  }

  const totals = rows.reduce(
    (a, r) => ({ kwh: a.kwh + r.kwh, sessions: a.sessions + r.sessions, energy_rev: a.energy_rev + r.energy_rev, showup_rev: a.showup_rev + r.showup_rev, total_rev: a.total_rev + r.total_rev }),
    { kwh: 0, sessions: 0, energy_rev: 0, showup_rev: 0, total_rev: 0 }
  );

  // previous period (slightly lower)
  const prevRows = rows.map((r) => ({
    ...r,
    kwh: r.kwh * 0.88,
    total_rev: r.total_rev * 0.88,
    energy_rev: r.energy_rev * 0.88,
    showup_rev: r.showup_rev,
  }));
  const prevTotals = prevRows.reduce(
    (a, r) => ({ kwh: a.kwh + r.kwh, sessions: a.sessions + r.sessions, energy_rev: a.energy_rev + r.energy_rev, showup_rev: a.showup_rev + r.showup_rev, total_rev: a.total_rev + r.total_rev }),
    { kwh: 0, sessions: 0, energy_rev: 0, showup_rev: 0, total_rev: 0 }
  );

  return {
    period,
    settings: { kwh_rate: 0.50, daily_showup_fee: 150, showup_fee_enabled: true, report_emails: ['billing@example.com'], weekly_report_enabled: true },
    current:  { rows, totals },
    previous: { rows: prevRows, totals: prevTotals },
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────
const fmtUsd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const fmtKwh = (n) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n || 0) + ' kWh';

function pctChange(curr, prev) {
  if (!prev) return null;
  const diff = ((curr - prev) / prev) * 100;
  return diff;
}

function PctBadge({ value }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 700,
      color: up ? C.green : C.red,
      background: up ? '#47a14122' : '#ef444422',
      border: `1px solid ${up ? '#47a14144' : '#ef444444'}`,
      borderRadius: 999,
      padding: '2px 8px',
      marginLeft: 8,
    }}>
      {up ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function BillingTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: C.muted, marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight: 600, lineHeight: 1.8 }}>
          {p.name}: {p.dataKey === 'kwh' ? fmtKwh(p.value) : fmtUsd(p.value)}
        </div>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, compare, accent }) {
  const pct = compare !== null && compare !== undefined ? pctChange(value, compare) : null;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 24px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: C.muted, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: accent || C.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        {pct !== null && <PctBadge value={pct} />}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ settings: init, onSaved }) {
  const [form, setForm] = useState({
    kwh_rate:              init?.kwh_rate          ?? 0.50,
    daily_showup_fee:      init?.daily_showup_fee  ?? 150,
    showup_fee_enabled:    init?.showup_fee_enabled ?? true,
    weekly_report_enabled: init?.weekly_report_enabled ?? true,
    report_emails:         (init?.report_emails || []).join(', '),
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportStatus, setReportStatus]   = useState(null);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        kwh_rate:              parseFloat(form.kwh_rate)         || 0,
        daily_showup_fee:      parseFloat(form.daily_showup_fee) || 0,
        showup_fee_enabled:    form.showup_fee_enabled,
        weekly_report_enabled: form.weekly_report_enabled,
        report_emails:         form.report_emails.split(',').map((e) => e.trim()).filter(Boolean),
      };
      await api.saveBillingSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendReport() {
    setSendingReport(true);
    setReportStatus(null);
    try {
      const result = await api.sendBillingReport();
      setReportStatus({ ok: true, msg: `Report sent to: ${result.sent.join(', ')} — ${fmtUsd(result.total_rev)} gross` });
    } catch (err) {
      setReportStatus({ ok: false, msg: err.message });
    } finally {
      setSendingReport(false);
    }
  }

  const row = (label, children) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.text }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
    </div>
  );

  const toggle = (key) => (
    <button
      onClick={() => setForm((f) => ({ ...f, [key]: !f[key] }))}
      style={{
        width: 42,
        height: 24,
        borderRadius: 999,
        border: 'none',
        background: form[key] ? C.green : C.border,
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: form[key] ? 21 : 3,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
      }} />
    </button>
  );

  const numInput = (key, prefix) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {prefix && <span style={{ color: C.muted, fontSize: 13 }}>{prefix}</span>}
      <input
        type="number"
        step="0.01"
        min="0"
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={{
          width: 90,
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: '5px 8px',
          color: C.text,
          fontSize: 13,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      />
    </div>
  );

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 28px', marginTop: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Billing Settings</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
        Changes apply to all future revenue calculations and reports.
      </div>

      {row('Rate per kWh',       numInput('kwh_rate', '$'))}
      {row('Daily show-up fee',  numInput('daily_showup_fee', '$'))}
      {row('Show-up fee enabled', toggle('showup_fee_enabled'))}
      {row('Weekly email report', toggle('weekly_report_enabled'))}

      <div style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>Report recipient emails</div>
        <textarea
          value={form.report_emails}
          onChange={(e) => setForm((f) => ({ ...f, report_emails: e.target.value }))}
          placeholder="billing@yourcompany.com, ops@yourcompany.com"
          rows={2}
          style={{
            width: '100%',
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '8px 10px',
            color: C.text,
            fontSize: 12,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Comma-separated. Sent every Monday at 06:00 UTC.</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            background: C.green,
            border: 'none',
            borderRadius: 8,
            padding: '9px 20px',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save Settings'}
        </button>

        <button
          onClick={sendReport}
          disabled={sendingReport}
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '9px 20px',
            color: C.muted,
            fontSize: 13,
            fontWeight: 600,
            cursor: sendingReport ? 'default' : 'pointer',
            opacity: sendingReport ? 0.6 : 1,
          }}
        >
          {sendingReport ? 'Sending…' : 'Send Report Now'}
        </button>
      </div>

      {reportStatus && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          borderRadius: 8,
          background: reportStatus.ok ? '#47a14118' : '#ef444418',
          border: `1px solid ${reportStatus.ok ? '#47a14144' : '#ef444444'}`,
          fontSize: 12,
          color: reportStatus.ok ? C.green : C.red,
        }}>
          {reportStatus.msg}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Billing() {
  const profile  = useProfile();
  const isAdmin  = profile?.role === 'admin';

  const [period,     setPeriod]     = useState('monthly');
  const [compare,    setCompare]    = useState(true);
  const [demoMode,   setDemoMode]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const load = useCallback(async () => {
    if (demoMode) {
      setData(makeDemoData(period));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api.getBillingSummary(period);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period, demoMode]);

  useEffect(() => { load(); }, [load]);

  const curr = data?.current;
  const prev = data?.previous;

  // Build chart rows — merge current and previous by index for compare overlay
  const chartRows = (curr?.rows || []).map((r, i) => ({
    ...r,
    label:        period === 'monthly' ? r.date.slice(0, 7) : r.date,
    prev_total:   compare ? (prev?.rows?.[i]?.total_rev ?? null) : null,
    prev_kwh:     compare ? (prev?.rows?.[i]?.kwh ?? null) : null,
  }));

  const tabBtn = (key) => (
    <button
      key={key}
      onClick={() => setPeriod(key)}
      style={{
        padding: '6px 16px',
        borderRadius: 7,
        border: `1px solid ${period === key ? C.green : C.border}`,
        background: period === key ? '#47a14122' : 'transparent',
        color: period === key ? C.green : C.muted,
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {PERIODS.find((p) => p.key === key)?.label}
    </button>
  );

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Billing</h1>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Revenue from delivered energy · rates from billing settings
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Demo mode toggle */}
          <button
            onClick={() => { setDemoMode((d) => !d); }}
            style={{
              background: demoMode ? '#2a1f00' : C.panel,
              border: `1px solid ${demoMode ? C.amber : C.border}`,
              borderRadius: 7,
              padding: '7px 14px',
              color: demoMode ? C.amber : C.muted,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: demoMode ? C.amber : '#4b5563', display: 'inline-block', boxShadow: demoMode ? `0 0 6px ${C.amber}` : 'none' }} />
            {demoMode ? 'Demo Mode ON' : 'Demo Mode'}
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowSettings((s) => !s)}
              style={{
                background: showSettings ? '#2d5c2a33' : C.panel,
                border: `1px solid ${showSettings ? C.green : C.border}`,
                borderRadius: 7,
                padding: '7px 14px',
                color: showSettings ? C.green : C.muted,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {showSettings ? 'Hide Settings' : 'Settings'}
            </button>
          )}
        </div>
      </div>

      {/* Demo banner */}
      {demoMode && (
        <div style={{ background: '#2a1f00', border: `1px solid ${C.amber}`, borderRadius: 8, padding: '10px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: C.amber, color: '#000', fontWeight: 800, fontSize: 10, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Demo</span>
          <span style={{ fontSize: 12, color: '#fbbf24' }}>Simulated data for presentation purposes only. No real charger data is shown.</span>
        </div>
      )}

      {/* Period tabs + compare toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODS.map((p) => tabBtn(p.key))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: C.muted }}>
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
            style={{ accentColor: C.blue }}
          />
          Compare to previous period
        </label>
      </div>

      {loading && <div style={{ color: C.muted, padding: 40 }}>Loading billing data...</div>}
      {error && !demoMode && (
        <div style={{ color: C.red, background: C.card, border: `1px solid #ef444444`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && curr && (
        <>
          {/* KPI stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
            <StatCard
              label="Gross Revenue"
              value={fmtUsd(curr.totals.total_rev)}
              compare={prev?.totals?.total_rev}
              accent={C.green}
              sub={`${fmtKwh(curr.totals.kwh)} dispensed`}
            />
            <StatCard
              label="Energy Revenue"
              value={fmtUsd(curr.totals.energy_rev)}
              compare={prev?.totals?.energy_rev}
              accent={C.blue}
              sub={`@ $${(data?.settings?.kwh_rate ?? 0.5).toFixed(2)}/kWh`}
            />
            <StatCard
              label="Show-up Fees"
              value={fmtUsd(curr.totals.showup_rev)}
              compare={prev?.totals?.showup_rev}
              sub={data?.settings?.showup_fee_enabled ? `$${(data?.settings?.daily_showup_fee ?? 0).toFixed(0)}/day` : 'Disabled'}
            />
            <StatCard
              label="Total Sessions"
              value={curr.totals.sessions.toLocaleString()}
              compare={prev?.totals?.sessions}
              sub="Charging sessions"
            />
          </div>

          {/* Revenue bar chart */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 24px 16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Gross Revenue</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  Energy revenue + show-up fees · {PERIODS.find((p) => p.key === period)?.label} view
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.muted }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: C.green, display: 'inline-block' }} />
                  Energy rev
                </span>
                {data?.settings?.showup_fee_enabled && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: C.blue, display: 'inline-block' }} />
                    Show-up fee
                  </span>
                )}
                {compare && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 2, background: C.amber, display: 'inline-block' }} />
                    Prior period
                  </span>
                )}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartRows} barGap={2} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: C.muted, fontSize: 10 }}
                  axisLine={{ stroke: C.border }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: C.muted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<BillingTooltip />} cursor={{ fill: '#ffffff08' }} />
                <Bar dataKey="energy_rev" name="Energy rev" stackId="a" fill={C.green} radius={[0, 0, 0, 0]} />
                {data?.settings?.showup_fee_enabled && (
                  <Bar dataKey="showup_rev" name="Show-up" stackId="a" fill={C.blue} radius={[4, 4, 0, 0]} />
                )}
                {compare && (
                  <Bar dataKey="prev_total" name="Prior period" fill={C.amber} fillOpacity={0.25} radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* kWh dispensed line chart */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 24px 16px', marginBottom: 20 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Energy Dispensed</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Total kWh delivered to customer vehicles</div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.border }} tickLine={false} interval="preserveStartEnd" />
                <YAxis
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: C.muted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<BillingTooltip />} />
                <Line type="monotone" dataKey="kwh" name="kWh" stroke={C.blue} strokeWidth={2} dot={false} />
                {compare && (
                  <Line type="monotone" dataKey="prev_kwh" name="Prior period" stroke={C.amber} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Data table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700, color: C.text }}>
              Breakdown
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                <thead>
                  <tr style={{ background: C.panel }}>
                    {['Date', 'Sessions', 'kWh Delivered', 'Energy Rev', 'Show-up Fee', 'Total Gross'].map((h) => (
                      <th key={h} style={{ padding: '10px 20px', textAlign: h === 'Date' ? 'left' : 'right', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartRows.map((r) => (
                    <tr key={r.date} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: '10px 20px', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{r.label}</td>
                      <td style={{ padding: '10px 20px', textAlign: 'right', color: C.muted }}>{r.sessions}</td>
                      <td style={{ padding: '10px 20px', textAlign: 'right', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{fmtKwh(r.kwh)}</td>
                      <td style={{ padding: '10px 20px', textAlign: 'right', color: C.blue,  fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(r.energy_rev)}</td>
                      <td style={{ padding: '10px 20px', textAlign: 'right', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{data?.settings?.showup_fee_enabled ? fmtUsd(r.showup_rev) : '—'}</td>
                      <td style={{ padding: '10px 20px', textAlign: 'right', color: C.green, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(r.total_rev)}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr style={{ borderTop: `2px solid ${C.border}`, background: C.panel }}>
                    <td style={{ padding: '12px 20px', color: C.text, fontWeight: 700 }}>Total</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: C.text, fontWeight: 700 }}>{curr.totals.sessions}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: C.text, fontWeight: 700 }}>{fmtKwh(curr.totals.kwh)}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: C.blue,  fontWeight: 700 }}>{fmtUsd(curr.totals.energy_rev)}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: C.text, fontWeight: 700 }}>{data?.settings?.showup_fee_enabled ? fmtUsd(curr.totals.showup_rev) : '—'}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: C.green, fontWeight: 800, fontSize: 14 }}>{fmtUsd(curr.totals.total_rev)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Settings panel */}
      {isAdmin && showSettings && data?.settings && (
        <SettingsPanel settings={data.settings} onSaved={load} />
      )}
    </div>
  );
}
