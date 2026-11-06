import { useState, useEffect } from 'react';
import { Send, Copy, Check, RefreshCw, Trash2, Wrench, SlidersHorizontal, HelpCircle, Layers } from 'lucide-react';
import { api } from '../../lib/api';
import { useProfile } from '../../contexts/ProfileContext';
import { C, btnStyle, linkBtn, cardStyle, fmtDate, joinText, tableStyle, thStyle, tdStyle } from '../../lib/bmsUi';
import { Markdown } from './BmsSections';
import { DictationButton } from './Dictation';

// Page change requests: anyone describes how they want the BMS Reports page
// to change (by typing or dictating). Claude reads each request and either
// proposes analysis-settings changes that can be applied with one click, or
// writes a spec for a developer when the change needs code.

const KIND = {
  settings: { label: 'Settings change', color: C.green, Icon: SlidersHorizontal },
  code: { label: 'Code change', color: '#a855f7', Icon: Wrench },
  both: { label: 'Settings + code', color: C.blue, Icon: Layers },
  question: { label: 'Needs more detail', color: C.amber, Icon: HelpCircle },
};

const STATUS = [
  ['open', 'Open'],
  ['in_progress', 'In progress'],
  ['done', 'Done'],
  ['declined', 'Declined'],
];

function settingLabel(group, key) {
  const name = key.replace(/_/g, ' ').replace(/\b(kw|kwh|soc|soh|ohm|v|a|c)\b/gi, (m) => m.toUpperCase());
  return `${group} › ${name}`;
}

function showValue(v) {
  if (v === true) return 'on';
  if (v === false) return 'off';
  if (v == null || v === '') return '—';
  return String(v);
}

export default function BmsRequests({ aiReady, onSettingsChanged }) {
  const profile = useProfile();
  const canManage = profile?.role === 'admin' || profile?.role === 'operator';
  const isAdmin = profile?.role === 'admin';
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [dictLang, setDictLang] = useState(() => (navigator.language || '').startsWith('zh') ? 'zh' : 'en');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('active');

  useEffect(() => {
    let cancelled = false;
    api.getBmsRequests()
      .then((r) => { if (!cancelled) setRequests(r); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  function replace(row) {
    setRequests((list) => (list || []).map((r) => (r.id === row.id ? { ...r, ...row } : r)));
  }

  async function submit() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const row = await api.createBmsRequest(body);
      setRequests((list) => [row, ...(list || [])]);
      setText('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  const visible = (requests || []).filter((r) => (filter === 'all' ? true : filter === 'active' ? ['open', 'in_progress'].includes(r.status) : r.status === filter));
  const counts = Object.fromEntries(STATUS.map(([s]) => [s, (requests || []).filter((r) => r.status === s).length]));

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Page change requests</h1>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4, maxWidth: 820, lineHeight: 1.5 }}>
          Describe how the BMS Reports page should change — what to show, hide, measure or warn about, or how it should look.
          Claude reads each request: settings it can change right away are applied with one click, and anything that needs code
          becomes a ready-to-hand-over spec for a developer.
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>New request</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
            rows={4}
            placeholder={dictLang === 'zh'
              ? '例如：在概览中加入每次放电的平均功率，并在温度超过 42°C 时发出警告。'
              : 'e.g. Warn when temperature goes above 42°C, and add a chart of current per vehicle session.'}
            style={textareaStyle}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
            <DictationButton lang={dictLang} onText={(chunk) => setText((v) => joinText(v, chunk))} />
            <button
              type="button"
              onClick={() => setDictLang((l) => (l === 'zh' ? 'en' : 'zh'))}
              title="Dictation language"
              style={{ ...linkBtn, fontSize: 11, color: C.muted }}
            >
              {dictLang === 'zh' ? '中文' : 'EN'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={submit} disabled={!text.trim() || sending} style={btnStyle(true)}>
            <Send size={14} /> {sending ? 'Claude is reading it…' : aiReady ? 'Send to Claude' : 'Save request'}
          </button>
          {!aiReady && <span style={{ fontSize: 12, color: C.muted }}>No Anthropic API key yet — requests are saved, and Claude can read them once a key is added.</span>}
          {error && <span style={{ fontSize: 12, color: C.red }}>{error}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['active', `Open & in progress (${counts.open + counts.in_progress})`], ['done', `Done (${counts.done})`], ['declined', `Declined (${counts.declined})`], ['all', `All (${(requests || []).length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={pill(filter === id)}>{label}</button>
        ))}
      </div>

      {!requests ? (
        <div style={{ color: C.muted, fontSize: 13 }}>{error ? '' : 'Loading…'}</div>
      ) : visible.length === 0 ? (
        <div style={{ ...cardStyle, color: C.muted, fontSize: 13, textAlign: 'center' }}>No requests here yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              canManage={canManage}
              isAdmin={isAdmin}
              aiReady={aiReady}
              onChange={replace}
              onDelete={() => setRequests((list) => list.filter((x) => x.id !== r.id))}
              onSettingsChanged={onSettingsChanged}
            />
          ))}
        </div>
      )}
    </>
  );
}

function RequestCard({ r, canManage, isAdmin, aiReady, onChange, onDelete, onSettingsChanged }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(r.ai_error || null);
  const [copied, setCopied] = useState(false);
  const ai = r.ai;
  const kind = ai ? KIND[ai.kind] || KIND.question : null;

  async function run(label, fn) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  const reinterpret = () => run('interpret', async () => {
    const row = await api.interpretBmsRequest(r.id);
    if (row.ai_error) setErr(row.ai_error);
    onChange(row);
  });
  const apply = () => run('apply', async () => {
    const out = await api.applyBmsRequest(r.id);
    onChange(out.request);
    onSettingsChanged?.(out.settings);
  });
  const setStatus = (status) => run('status', async () => onChange(await api.updateBmsRequest(r.id, { status })));
  const remove = () => run('delete', async () => {
    if (!window.confirm('Delete this request?')) return;
    await api.deleteBmsRequest(r.id);
    onDelete();
  });
  async function copySpec() {
    const spec = `# ${ai.title}\n\nRequested by ${r.author || 'the team'} on ${new Date(r.created_at).toLocaleDateString()}:\n> ${r.request.replace(/\n/g, '\n> ')}\n\n${ai.code_spec}`;
    try {
      await navigator.clipboard.writeText(spec);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Could not copy — select the text and copy it manually.');
    }
  }

  return (
    <div style={{ ...cardStyle, borderColor: kind ? `${kind.color}55` : C.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 300px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {kind && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: C.text, border: `1px solid ${kind.color}66`, background: `${kind.color}1a`, borderRadius: 999, padding: '2px 9px' }}>
                <kind.Icon size={12} color={kind.color} /> {kind.label}
              </span>
            )}
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{ai?.title || r.request.split('\n')[0].slice(0, 90)}</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            {r.author || 'Someone'} · {fmtDate(r.created_at)}{r.applied_at ? ` · settings applied ${fmtDate(r.applied_at)}${r.applied_by ? ` by ${r.applied_by}` : ''}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canManage ? (
            <select value={r.status} disabled={!!busy} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
              {STATUS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 12, color: C.muted }}>{STATUS.find(([id]) => id === r.status)?.[1]}</span>
          )}
          {isAdmin && <button onClick={remove} disabled={!!busy} title="Delete" style={{ ...linkBtn, color: C.muted }}><Trash2 size={14} /></button>}
        </div>
      </div>

      <div style={{ marginTop: 10, padding: '8px 12px', borderLeft: `3px solid ${C.border}`, fontSize: 13, color: C.text, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {r.request}
      </div>

      {ai && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55 }}>{ai.summary}</div>

          {ai.settings_changes?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Settings Claude would change</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead><tr>{['Setting', 'Now', 'New', 'Why'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {ai.settings_changes.map((c) => (
                      <tr key={`${c.group}.${c.key}`} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ ...tdStyle, color: C.text }}>{settingLabel(c.group, c.key)}</td>
                        <td style={tdStyle}>{showValue(c.previous)}</td>
                        <td style={{ ...tdStyle, color: C.green, fontWeight: 600 }}>{showValue(c.value)}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'normal', minWidth: 220 }}>{c.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canManage && (
                <button onClick={apply} disabled={!!busy} style={{ ...btnStyle(!r.applied_at), marginTop: 10 }}>
                  <SlidersHorizontal size={14} /> {busy === 'apply' ? 'Applying…' : r.applied_at ? 'Apply again' : 'Apply these settings'}
                </button>
              )}
            </div>
          )}

          {ai.code_spec && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Developer spec (needs a code change)</div>
                <button onClick={copySpec} style={{ ...linkBtn, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy spec'}
                </button>
              </div>
              <div style={{ background: C.inner, borderRadius: 10, padding: '12px 14px' }}><Markdown text={ai.code_spec} /></div>
            </div>
          )}

          {ai.questions?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.amber, marginBottom: 4 }}>Claude needs to know</div>
              <ul style={{ margin: 0, paddingLeft: 20, listStyleType: 'disc', fontSize: 13, color: C.text, lineHeight: 1.6 }}>
                {ai.questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Answer by sending a new request with the details.</div>
            </div>
          )}

          <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>Read by {ai.model || 'Claude'} · {fmtDate(ai.at)}</div>
        </div>
      )}

      {err && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{err}</div>}
      {canManage && aiReady && (
        <button onClick={reinterpret} disabled={!!busy} style={{ ...linkBtn, marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> {busy === 'interpret' ? 'Claude is reading…' : ai ? 'Ask Claude again' : 'Ask Claude to read this'}
        </button>
      )}
    </div>
  );
}

function pill(active) {
  return {
    background: active ? '#2d5c2a33' : C.inner, border: `1px solid ${active ? C.green : C.border}`,
    borderRadius: 6, padding: '5px 12px', color: active ? C.green : C.muted, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  };
}

const textareaStyle = {
  flex: 1, width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '10px 12px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.5,
};
const selectStyle = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, padding: '5px 8px', cursor: 'pointer' };
