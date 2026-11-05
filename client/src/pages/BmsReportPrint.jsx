import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Activity, Printer } from 'lucide-react';
import { api } from '../lib/api';
import { makeT } from '../lib/bmsI18n';
import { C, ReportProvider, fmt, fmtDate, btnStyle } from '../lib/bmsUi';
import { ReportBody, Section, Markdown } from '../components/bms/BmsSections';

// Print / PDF view of one BMS report: /bms/:id/print?lang=en|zh&ai=1&notes=1&chat=0
// Same sections as the report page, laid out for A4, dark theme kept. Opens
// the browser's print dialog once the charts have drawn ("Save as PDF").

const PAGE_WIDTH = 1040; // laid out at this width, zoomed to fit A4 when printing

export default function BmsReportPrint() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const lang = params.get('lang') === 'zh' ? 'zh' : 'en';
  const withAi = params.get('ai') === '1';
  const withNotes = params.get('notes') !== '0';
  const withChat = params.get('chat') === '1';
  const t = makeT(lang);

  const [data, setData] = useState(null);
  const [chat, setChat] = useState(null);
  const [error, setError] = useState(null);
  const [generatedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getBmsReport(id), withChat ? api.getBmsChat(id).catch(() => []) : Promise.resolve(null)])
      .then(([r, c]) => { if (!cancelled) { setData(r); setChat(c); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [id, withChat]);

  useEffect(() => {
    if (!data) return;
    const name = data.report.label || data.analysis.meta.device_model || 'BMS';
    const day = new Date(data.analysis.summary.start).toISOString().slice(0, 10);
    document.title = `${name} ${t('bms_report')} ${day}${lang === 'zh' ? ' (中文)' : ''}`;
    // Let the charts finish drawing before the dialog freezes the page.
    const timer = setTimeout(() => window.print(), 1200);
    return () => clearTimeout(timer);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div style={{ padding: 40, color: C.red, background: C.bg, minHeight: '100vh' }}>{error}</div>;
  if (!data) return <div style={{ padding: 40, color: C.muted, background: C.bg, minHeight: '100vh' }}>{t('analyzing')}</div>;

  const { report, analysis: a } = data;
  const s = a.summary;
  const ai = report.ai_analysis?.[lang];

  const extras = (
    <>
      {withNotes && report.notes && (
        <Section title={t('notes')}>
          <div style={{ fontSize: 13.5, color: C.text, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{report.notes}</div>
        </Section>
      )}
      {withAi && ai && (
        <Section title={t('ai')} subtitle={t('ai_generated', { date: fmtDate(ai.at, lang), model: ai.model || 'Claude' })}>
          <Markdown text={ai.text} />
        </Section>
      )}
      {withChat && chat?.length > 0 && (
        <Section title={t('chat')}>
          {chat.map((m) => (
            <div key={m.id} style={{ marginBottom: 12, breakInside: 'avoid' }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{m.role === 'user' ? (m.author || t('you')) : 'Claude'} · {fmtDate(m.created_at, lang)}</div>
              {m.role === 'user'
                ? <div style={{ fontSize: 13.5, color: C.text, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                : <Markdown text={m.content} />}
            </div>
          ))}
        </Section>
      )}
    </>
  );

  return (
    <ReportProvider value={{ t, lang, print: true }}>
      <style>{`
        @page { size: A4; margin: 0; }
        html, body { background: ${C.bg}; }
        @media print {
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-root { zoom: 0.76; }
          .bms-section { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: C.card, borderBottom: `1px solid ${C.border}`, padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => window.print()} style={btnStyle(true)}><Printer size={14} /> {t('print_save')}</button>
        <span style={{ fontSize: 12, color: C.muted }}>{t('print_hint')}</span>
      </div>

      <div className="print-root" style={{ width: PAGE_WIDTH, maxWidth: '100%', margin: '0 auto', padding: '24px 24px 32px', boxSizing: 'border-box', background: C.bg }}>
        {/* Report header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: `2px solid ${C.green}`, paddingBottom: 14, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.green, fontWeight: 700, fontSize: 13 }}>
              <Activity size={16} /> Primecom Technologies · {t('bms_report')}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginTop: 6 }}>
              {report.label || (a.meta.device_model ? t('battery_suffix', { model: a.meta.device_model }) : t('bms_report'))}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.7 }}>
              {fmtDate(s.start, lang)} → {fmtDate(s.end, lang)} · {fmt(s.hours, 'h')} · {t('readings_every', { n: s.samples, s: s.interval_s })}
              <br />
              {a.meta.nominal_v && `${a.meta.nominal_v} V · ${a.meta.capacity_ah} Ah · ${fmt(a.meta.nominal_kwh, 'kWh')} · `}
              {a.meta.device_model} · HWID {a.meta.hwid}
              {report.vehicle && <> · {t('charging_vehicles')} {report.vehicle}</>}
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.muted, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {t('generated', { date: fmtDate(generatedAt, lang) })}
            <br />{report.file_name}
          </div>
        </div>

        <ReportBody data={data} extras={extras} />
      </div>
    </ReportProvider>
  );
}
