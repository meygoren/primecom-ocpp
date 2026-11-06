import { useState, useEffect } from 'react';
import { Send, Copy, Check, RefreshCw, Trash2, Wrench, SlidersHorizontal, HelpCircle, Layers, ShieldCheck, XCircle, Mail, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import { useProfile } from '../../contexts/ProfileContext';
import { C, btnStyle, linkBtn, cardStyle, fmtDate, joinText, tableStyle, thStyle, tdStyle } from '../../lib/bmsUi';
import { Markdown } from './BmsSections';
import { DictationButton } from './Dictation';

// Page change requests: anyone describes how they want the BMS Reports page
// to change (typing or dictating) and gives their name. Claude reads each
// request and drafts a proposal — settings it would change, or a developer
// spec when code is needed. Nothing is applied until an admin approves it;
// admins are emailed about every new request.

const KIND = {
  settings: { label: 'Settings change', color: C.green, Icon: SlidersHorizontal },
  code: { label: 'Code change', color: '#a855f7', Icon: Wrench },
  both: { label: 'Settings + code', color: C.blue, Icon: Layers },
  question: { label: 'Needs more detail', color: C.amber, Icon: HelpCircle },
};

const STATUS = {
  pending: { label: 'Waiting for approval', color: C.amber },
  approved: { label: 'Approved', color: C.green },
  in_progress: { label: 'In progress', color: C.blue },
  done: { label: 'Done', color: C.green },
  declined: { label: 'Declined', color: C.muted },
};

const NAME_KEY = 'bms_requester_name';

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

function statusOf(r) {
  return r.status === 'open' ? 'pending' : r.status;
}

export default function BmsRequests({ aiReady, onSettingsChanged }) {
  const profile = useProfile();
  const isAdmin = profile?.role === 'admin';
  const canAskAgain = profile?.role === 'admin' || profile?.role === 'operator';
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [name, setName] = useState(() => {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
  });
  const [dictLang, setDictLang] = useState(() => (navigator.language || '').startsWith('zh') ? 'zh' : 'en');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [filter, setFilter] = useState(isAdmin ? 'pending' : 'all');

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
    const who = name.trim();
    if (!body || !who) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      try { localStorage.setItem(NAME_KEY, who); } catch { /* storage unavailable */ }
      const row = await api.createBmsRequest(body, who);
      setRequests((list) => [row, ...(list || [])]);
      setText('');
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  const list = requests || [];
  const count = (s) => list.filter((r) => statusOf(r) === s).length;
  const visible = list.filter((r) => {
    const s = statusOf(r);
    if (filter === 'all') return true;
    if (filter === 'active') return s === 'approved' || s === 'in_progress';
    return s === filter;
  });

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Page change requests</h1>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4, maxWidth: 820, lineHeight: 1.5 }}>
          Doing the same thing over and over, or missing something on the BMS Reports page? Describe the change you want.
          Claude drafts how to do it — a settings change or a spec for a developer — and an admin is emailed to review it.
          <strong style={{ color: C.text }}> Nothing changes until an admin approves it.</strong>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>New request</div>
        <label style={{ display: 'block', marginBottom: 10, maxWidth: 360 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Your name <span style={{ color: C.red }}>*</span></div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kuz" style={inputStyle} />
        </label>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>What do you want changed? <span style={{ color: C.red }}>*</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setSent(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
            rows={4}
            placeholder={dictLang === 'zh'
              ? '例如：在概览中加入每次放电的平均功率，并在温度超过 42°C 时发出警告。'
              : 'e.g. I check the cell spread every morning — warn me when it goes over 80 mV, and show the discharge sessions first.'}
            style={textareaStyle}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
            <DictationButton lang={dictLang} onText={(chunk) => { setText((v) => joinText(v, chunk)); setSent(false); }} />
            <button type="button" onClick={() => setDictLang((l) => (l === 'zh' ? 'en' : 'zh'))} title="Dictation language" style={{ ...linkBtn, fontSize: 11, color: C.muted }}>
              {dictLang === 'zh' ? '中文' : 'EN'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={submit} disabled={!text.trim() || !name.trim() || sending} style={btnStyle(true)}>
            <Send size={14} /> {sending ? (aiReady ? 'Claude is reading it…' : 'Sending…') : 'Send for approval'}
          </button>
          {sent && <span style={{ fontSize: 12, color: C.green }}>Sent — an admin has been notified and will review it.</span>}
          {!aiReady && !sent && <span style={{ fontSize: 12, color: C.muted }}>No Anthropic API key yet — requests are still saved and emailed; Claude reads them once a key is added.</span>}
          {error && <span style={{ fontSize: 12, color: C.red }}>{error}</span>}
        </div>
      </div>

      {isAdmin && <NotificationSettings />}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[
          ['pending', `Waiting for approval (${count('pending')})`],
          ['active', `Approved & in progress (${count('approved') + count('in_progress')})`],
          ['done', `Done (${count('done')})`],
          ['declined', `Declined (${count('declined')})`],
          ['all', `All (${list.length})`],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={pill(filter === id)}>{label}</button>
        ))}
      </div>

      {!requests ? (
        <div style={{ color: C.muted, fontSize: 13 }}>{error ? '' : 'Loading…'}</div>
      ) : visible.length === 0 ? (
        <div style={{ ...cardStyle, color: C.muted, fontSize: 13, textAlign: 'center' }}>No requests here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              isAdmin={isAdmin}
              canAskAgain={canAskAgain && aiReady}
              onChange={replace}
              onDelete={() => setRequests((l) => l.filter((x) => x.id !== r.id))}
              onSettingsChanged={onSettingsChanged}
            />
          ))}
        </div>
      )}
    </>
  );
}

function RequestCard({ r, isAdmin, canAskAgain, onChange, onDelete, onSettingsChanged }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(r.ai_error || null);
  const [copied, setCopied] = useState(false);
  const [applySettings, setApplySettings] = useState(true);
  const [note, setNote] = useState('');
  const ai = r.ai;
  const kind = ai ? KIND[ai.kind] || KIND.question : null;
  const status = statusOf(r);
  const st = STATUS[status] || STATUS.pending;
  const hasSettings = ai?.settings_changes?.length > 0;

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
  const approve = () => run('approve', async () => {
    const out = await api.approveBmsRequest(r.id, { apply_settings: hasSettings && applySettings, note: note.trim() || undefined });
    onChange(out.request);
    if (out.settings) onSettingsChanged?.(out.settings);
  });
  const decline = () => run('decline', async () => onChange(await api.declineBmsRequest(r.id, note.trim() || undefined)));
  const setStatus = (s) => run('status', async () => onChange(await api.updateBmsRequest(r.id, { status: s })));
  const remove = () => run('delete', async () => {
    if (!window.confirm('Delete this request?')) return;
    await api.deleteBmsRequest(r.id);
    onDelete();
  });
  async function copySpec() {
    const spec = `# ${ai.title}\n\nRequested by ${r.requester_name || r.author || 'the team'} on ${new Date(r.created_at).toLocaleDateString()}:\n> ${r.request.replace(/\n/g, '\n> ')}\n\n${ai.code_spec}`;
    try {
      await navigator.clipboard.writeText(spec);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Could not copy — select the text and copy it manually.');
    }
  }

  return (
    <div style={{ ...cardStyle, borderColor: status === 'pending' ? `${C.amber}66` : C.border }}>
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
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Requested by <strong style={{ color: C.text }}>{r.requester_name || 'unknown'}</strong>
            {r.author ? ` (${r.author})` : ''} · {fmtDate(r.created_at)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && status !== 'pending' ? (
            <select value={status} disabled={!!busy} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
              {Object.entries(STATUS).filter(([id]) => id !== 'pending').map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
            </select>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: st.color }}>
              {status === 'pending' && <Clock size={13} />} {st.label}
            </span>
          )}
          {isAdmin && <button onClick={remove} disabled={!!busy} title="Delete" style={{ ...linkBtn, color: C.muted }}><Trash2 size={14} /></button>}
        </div>
      </div>

      <div style={{ marginTop: 10, padding: '8px 12px', borderLeft: `3px solid ${C.border}`, fontSize: 13, color: C.text, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {r.request}
      </div>

      {ai && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Claude's proposal (not applied)</div>
          <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55 }}>{ai.summary}</div>

          {hasSettings && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Settings it would change</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead><tr>{['Setting', 'Now', 'Proposed', 'Why'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
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
            </div>
          )}

          <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>Read by {ai.model || 'Claude'} · {fmtDate(ai.at)}</div>
        </div>
      )}

      {/* Decision */}
      {status === 'pending' && isAdmin && (
        <div style={{ marginTop: 14, padding: 14, background: C.inner, borderRadius: 10, border: `1px solid ${C.amber}44` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={15} color={C.green} /> Your decision
          </div>
          {hasSettings && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: C.text, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={applySettings} onChange={(e) => setApplySettings(e.target.checked)} />
              <span>Apply the {ai.settings_changes.length} setting change{ai.settings_changes.length === 1 ? '' : 's'} above when I approve</span>
            </label>
          )}
          {(ai?.kind === 'code' || ai?.kind === 'both') && (
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>The code part is not built automatically — approving marks it for development. Copy the spec to hand it over.</div>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the requester (optional)" style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={approve} disabled={!!busy} style={btnStyle(true)}>
              <ShieldCheck size={14} /> {busy === 'approve' ? 'Approving…' : hasSettings && applySettings ? 'Approve & apply settings' : 'Approve'}
            </button>
            <button onClick={decline} disabled={!!busy} style={{ ...btnStyle(), color: C.red }}>
              <XCircle size={14} /> {busy === 'decline' ? 'Declining…' : 'Decline'}
            </button>
          </div>
        </div>
      )}
      {status === 'pending' && !isAdmin && (
        <div style={{ marginTop: 12, fontSize: 12, color: C.amber, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} /> Waiting for an admin to review. Nothing has been changed.
        </div>
      )}
      {r.decided_at && (
        <div style={{ marginTop: 12, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          {status === 'declined' ? 'Declined' : 'Approved'} by {r.decided_by || 'an admin'} · {fmtDate(r.decided_at)}
          {r.applied_at ? ' · settings applied' : ''}
          {r.decision_note && <div style={{ color: C.text, marginTop: 2 }}>“{r.decision_note}”</div>}
        </div>
      )}

      {err && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{err}</div>}
      {canAskAgain && status === 'pending' && (
        <button onClick={reinterpret} disabled={!!busy} style={{ ...linkBtn, marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> {busy === 'interpret' ? 'Claude is reading…' : ai ? 'Ask Claude again' : 'Ask Claude to read this'}
        </button>
      )}
    </div>
  );
}

// Admins: who is emailed when someone submits a request.
function NotificationSettings() {
  const [cfg, setCfg] = useState(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.getRequestSettings()
      .then((c) => { setCfg(c); setText((c.emails || []).join('\n')); })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);

  async function save() {
    setMsg(null);
    try {
      const c = await api.saveRequestSettings(text.split(/[\s,;]+/).filter(Boolean));
      setCfg(c);
      setText(c.emails.join('\n'));
      setMsg({ ok: true, text: 'Saved' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 16, padding: '12px 18px' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ ...linkBtn, color: C.text, display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Mail size={15} color={C.green} /> Email when a request comes in
        </span>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>
          {cfg ? (cfg.effective.length ? cfg.effective.join(', ') : 'no recipients') : '…'}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          {cfg && !cfg.email_configured && (
            <div style={{ fontSize: 12, color: C.amber, marginBottom: 8, lineHeight: 1.5 }}>
              Email sending is not set up on the server yet: add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL to the Railway server variables (the same ones used by issue alerts).
            </div>
          )}
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Email addresses, one per line. Leave empty to email every admin account.</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="you@primecom.tech" style={{ ...textareaStyle, fontFamily: 'monospace', fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
            <button onClick={save} style={btnStyle(true)}>Save</button>
            {msg && <span style={{ fontSize: 12, color: msg.ok ? C.green : C.red }}>{msg.text}</span>}
          </div>
        </div>
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
const inputStyle = { width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none' };
const selectStyle = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, padding: '5px 8px', cursor: 'pointer' };
