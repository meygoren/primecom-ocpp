import { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Trash2, Pencil, X, KeyRound } from 'lucide-react';
import { api } from '../../lib/api';
import { Section, Markdown } from './BmsSections';
import { C, btnStyle, linkBtn, fmtDate, useReport } from '../../lib/bmsUi';

// Team notes, Claude's written analysis and the Claude chat for one BMS report.

export function TeamNotes({ report, canEdit, onSaved }) {
  const { t } = useReport();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(report.notes || '');
  const [err, setErr] = useState(null);

  async function save() {
    setErr(null);
    try {
      const updated = await api.updateBmsReport(report.id, { notes: text });
      onSaved(updated.notes);
      setEditing(false);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Section
      title={t('notes')}
      subtitle={t('notes_sub')}
      actions={canEdit && !editing && (
        <button onClick={() => { setText(report.notes || ''); setEditing(true); }} style={{ ...linkBtn, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
          <Pencil size={13} /> {t('edit')}
        </button>
      )}
    >
      {editing ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus style={textareaStyle} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <button onClick={save} style={btnStyle(true)}>{t('save')}</button>
            <button onClick={() => setEditing(false)} style={btnStyle()}>{t('cancel')}</button>
            {err && <span style={{ color: C.red, fontSize: 12 }}>{err}</span>}
          </div>
        </>
      ) : report.notes ? (
        <div style={{ fontSize: 13.5, color: C.text, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{report.notes}</div>
      ) : (
        <div style={{ fontSize: 13, color: C.muted }}>{t('notes_none')}</div>
      )}
    </Section>
  );
}

export function ClaudeAnalysis({ report, aiReady, canEdit, onSaved }) {
  const { t, lang } = useReport();
  const saved = report.ai_analysis?.[lang];
  const [streaming, setStreaming] = useState(null); // text while Claude writes
  const [err, setErr] = useState(null);

  async function generate() {
    setErr(null);
    setStreaming('');
    try {
      const done = await api.streamBms(`/api/bms/reports/${report.id}/analysis`, { lang }, (ev) => {
        if (ev.type === 'delta') setStreaming((s) => (s || '') + ev.text);
      });
      onSaved({ ...(report.ai_analysis || {}), [lang]: { text: done.text, model: done.model, at: new Date().toISOString() } });
    } catch (e) {
      setErr(e.message);
    } finally {
      setStreaming(null);
    }
  }

  const busy = streaming !== null;
  return (
    <Section
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Sparkles size={15} color={C.green} /> {t('ai')}</span>}
      subtitle={t('ai_sub')}
      actions={canEdit && aiReady && (
        <button onClick={generate} disabled={busy} style={btnStyle(!saved)}>
          <Sparkles size={14} /> {saved ? t('ai_regenerate') : t('ai_generate')}
        </button>
      )}
    >
      {!aiReady && <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>{t('ai_no_key')}</div>}
      {err && <div style={{ fontSize: 13, color: C.red, marginBottom: 8 }}>{err}</div>}
      {busy ? (
        <>
          {!streaming && <div style={{ fontSize: 13, color: C.muted }}>{t('ai_writing')}</div>}
          <Markdown text={streaming} />
        </>
      ) : saved ? (
        <>
          <Markdown text={saved.text} />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>{t('ai_generated', { date: fmtDate(saved.at, lang), model: saved.model || 'Claude' })}</div>
        </>
      ) : (
        aiReady && <div style={{ fontSize: 13, color: C.muted }}>{t('ai_missing')}</div>
      )}
    </Section>
  );
}

export function ClaudeChat({ reportId, aiReady, canEdit }) {
  const { t, lang } = useReport();
  const [messages, setMessages] = useState(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(null);
  const [err, setErr] = useState(null);
  const endRef = useRef();

  useEffect(() => {
    let cancelled = false;
    api.getBmsChat(reportId)
      .then((m) => { if (!cancelled) setMessages(m); })
      .catch((e) => { if (!cancelled) { setMessages([]); setErr(e.message); } });
    return () => { cancelled = true; };
  }, [reportId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming !== null) return;
    setErr(null);
    setInput('');
    setMessages((m) => [...(m || []), { role: 'user', content: text, id: `local-${Date.now()}` }]);
    setStreaming('');
    try {
      const done = await api.streamBms(`/api/bms/reports/${reportId}/chat`, { message: text }, (ev) => {
        if (ev.type === 'delta') setStreaming((s) => (s || '') + ev.text);
      });
      setMessages((m) => [...(m || []), { role: 'assistant', content: done.text, model: done.model, id: `local-a-${Date.now()}` }]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setStreaming(null);
    }
  }

  async function clear() {
    if (!window.confirm(lang === 'zh' ? '清空本报告的 Claude 对话？' : 'Clear the Claude conversation for this report?')) return;
    await api.clearBmsChat(reportId);
    setMessages([]);
  }

  return (
    <Section
      title={t('chat')}
      subtitle={t('chat_sub')}
      actions={canEdit && messages?.length > 0 && (
        <button onClick={clear} style={{ ...linkBtn, color: C.muted, display: 'inline-flex', gap: 5, alignItems: 'center' }}><Trash2 size={13} /> {t('clear_chat')}</button>
      )}
    >
      {!aiReady && <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>{t('ai_no_key')}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 520, overflowY: 'auto', marginBottom: messages?.length || streaming !== null ? 12 : 0 }}>
        {(messages || []).map((m) => <Bubble key={m.id} m={m} />)}
        {streaming !== null && (
          <Bubble m={{ role: 'assistant', content: streaming }} pending={!streaming} />
        )}
        <div ref={endRef} />
      </div>
      {err && <div style={{ fontSize: 13, color: C.red, marginBottom: 8 }}>{err}</div>}
      {canEdit && aiReady && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={t('chat_placeholder')}
            rows={2}
            style={{ ...textareaStyle, flex: 1 }}
          />
          <button onClick={send} disabled={!input.trim() || streaming !== null} style={{ ...btnStyle(true), height: 40 }}>
            <Send size={14} /> {t('send')}
          </button>
        </div>
      )}
    </Section>
  );
}

function Bubble({ m, pending }) {
  const { t } = useReport();
  const mine = m.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: 'min(100%, 760px)', background: mine ? '#2d5c2a55' : C.inner, border: `1px solid ${mine ? C.green + '44' : C.border}`,
        borderRadius: 12, padding: '10px 14px',
      }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{mine ? (m.author || t('you')) : 'Claude'}</div>
        {pending ? <div style={{ fontSize: 13, color: C.muted }}>{t('thinking')}</div>
          : mine ? <div style={{ fontSize: 13.5, color: C.text, whiteSpace: 'pre-wrap' }}>{m.content}</div>
          : <Markdown text={m.content} />}
      </div>
    </div>
  );
}

// Admin panel for the Anthropic API key and model.
export function ClaudeSettingsPanel({ status, isAdmin, onClose, onSaved }) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState(status?.model || 'claude-opus-5-5');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save(body) {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.saveAiSettings(body);
      onSaved(r);
      setKey('');
      setMsg({ ok: true, text: 'Saved' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(100%, 520px)', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, display: 'flex', gap: 8, alignItems: 'center' }}><KeyRound size={16} color={C.green} /> Claude settings</div>
          <button onClick={onClose} style={{ ...linkBtn, color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>
          Claude writes report analyses and answers questions in the BMS tab. The key is stored on the server only and never sent to the browser. Usage is billed to the Anthropic account that owns the key.
        </div>

        <div style={{ fontSize: 13, color: C.text, marginBottom: 14 }}>
          Status:{' '}
          {status?.configured
            ? <span style={{ color: C.green, fontWeight: 600 }}>Connected — key {status.key_hint} ({status.source})</span>
            : <span style={{ color: C.amber, fontWeight: 600 }}>No API key yet</span>}
        </div>

        {isAdmin ? (
          <>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{status?.configured ? 'Replace API key' : 'Anthropic API key'}</div>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" style={inputStyle} />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Model</div>
              <select value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle}>
                {(status?.models || []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button disabled={saving} onClick={() => save({ ...(key.trim() ? { api_key: key.trim() } : {}), model })} style={btnStyle(true)}>
                {saving ? 'Checking key…' : 'Save'}
              </button>
              {status?.source === 'saved in app' && (
                <button disabled={saving} onClick={() => save({ clear_key: true })} style={{ ...btnStyle(), color: C.red }}>Remove key</button>
              )}
              {msg && <span style={{ fontSize: 12, color: msg.ok ? C.green : C.red }}>{msg.text}</span>}
            </div>
            {status?.source === 'server variable' && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>The ANTHROPIC_API_KEY variable on the Railway server is in use and overrides a key saved here.</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: C.muted }}>Only admins can change the API key.</div>
        )}
      </div>
    </div>
  );
}

const textareaStyle = {
  width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '9px 12px', color: C.text, fontSize: 13.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.5,
};
const inputStyle = { width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none' };
