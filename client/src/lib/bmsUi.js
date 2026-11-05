import { createContext, useContext } from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { locale } from './bmsI18n';

// Shared look, formatting and language context for the BMS report screens
// (components/bms/*). Kept apart from the components so they hot-reload cleanly.

export const C = {
  bg: '#0f1117', card: '#1a1d27', inner: '#22263a', border: '#2e3347',
  text: '#f1f5f9', muted: '#8892a4', green: '#47a141', blue: '#3b82f6',
  amber: '#f59e0b', red: '#ef4444',
  // chart series (validated for the dark surface)
  s1: '#3987e5', s2: '#d95926', s3: '#199e70',
};

export const LEVEL = {
  critical: { color: C.red, Icon: AlertCircle },
  warning: { color: C.amber, Icon: AlertTriangle },
  info: { color: C.blue, Icon: Info },
};

export const ReportCtx = createContext({ t: (k) => k, lang: 'en', print: false });
export const ReportProvider = ReportCtx.Provider;
export function useReport() { return useContext(ReportCtx); }

// --- formatting ---------------------------------------------------------------

export function n(v) { const x = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(x) ? x : null; }
export function fmt(v, unit = '', d = 1) {
  const x = n(v);
  if (x == null) return '—';
  const s = Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : x.toFixed(d).replace(/\.0+$/, '');
  return unit ? `${s} ${unit}` : s;
}
export function fmtDate(t, lang) { return t ? new Date(t).toLocaleString(locale(lang), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }
export function fmtDay(t, lang) { return t ? new Date(t).toLocaleDateString(locale(lang), { month: 'short', day: 'numeric' }) : '—'; }
function fmtTime(t) { return t ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'; }
export function fmtMin(m) {
  const x = n(m);
  if (x == null) return '—';
  if (x < 60) return `${Math.round(x)}m`;
  return `${Math.floor(x / 60)}h ${Math.round(x % 60)}m`;
}

export const linkBtn = { background: 'none', border: 'none', padding: 0, color: C.green, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
export const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 };
export const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
export const thStyle = { padding: '9px 10px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' };
export const tdStyle = { padding: '9px 10px', color: C.muted, whiteSpace: 'nowrap' };
export const tooltipStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text };
export const rowStyle = { borderTop: `1px solid ${C.border}` };
export const axisTick = { fill: C.muted, fontSize: 11 };
export const chartMargin = { top: 6, right: 8, bottom: 0, left: 0 };
export const timeAxis = { dataKey: 't', type: 'number', scale: 'time', domain: ['dataMin', 'dataMax'], tickFormatter: fmtTime, tick: axisTick, axisLine: false, tickLine: false, minTickGap: 40 };

export function btnStyle(primary) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: primary ? C.green : C.inner, border: `1px solid ${primary ? C.green : C.border}`,
    borderRadius: 8, padding: '7px 14px', color: primary ? '#fff' : C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };
}
