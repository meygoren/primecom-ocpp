import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, ExternalLink, Lock } from 'lucide-react';
import { api } from '../../lib/api';
import { C, btnStyle, linkBtn, fmtDate } from '../../lib/bmsUi';

// Battery reference data — only shown to the platform owner (profile.is_owner;
// the server refuses everyone else). Tracks what was asked of the battery
// manufacturer / integrator, what came back, and the documents they sent.

const STATUS = [
  ['not_asked', 'Not asked yet', C.muted],
  ['asked', 'Waiting', C.amber],
  ['received', 'Received', C.green],
];

export default function BmsReference() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [showLater, setShowLater] = useState(false);
  const inputRef = useRef();

  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);
  useEffect(() => {
    let cancelled = false;
    api.getBmsReference()
      .then((r) => { if (!cancelled) { setData(r); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [reload]);

  async function save(patch) {
    const next = { ...data, ...patch };
    setData(next);
    setSaving(true);
    try {
      await api.saveBmsReference({ items: next.items, known: next.known, request_doc_url: next.request_doc_url });
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function setItem(id, patch) {
    save({ items: data.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  }

  async function upload(files) {
    for (const f of [...files]) {
      setBusy(`Uploading ${f.name}…`);
      try { await api.uploadBmsReferenceFile(f); } catch (e) { setError(`${f.name}: ${e.message}`); }
    }
    setBusy(null);
    load();
  }

  async function download(f) {
    try {
      const { blob, filename } = await api.downloadBmsReferenceFile(f.path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || f.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(f) {
    if (!window.confirm(`Delete ${f.name}?`)) return;
    await api.deleteBmsReferenceFile(f.path).catch((e) => setError(e.message));
    load();
  }

  if (!data) return <div style={{ fontSize: 12, color: error ? C.red : C.muted }}>{error || 'Loading…'}</div>;

  const priority = data.items.filter((x) => x.group === 'priority');
  const later = data.items.filter((x) => x.group !== 'priority');
  const received = priority.filter((x) => x.status === 'received').length;

  const row = (x) => (
    <div key={x.id} style={{ padding: '7px 0', borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.text }}>{x.title}</div>
          {x.detail && <div style={{ fontSize: 11, color: C.muted }}>{x.detail}</div>}
        </div>
        <select
          value={x.status}
          onChange={(e) => setItem(x.id, { status: e.target.value })}
          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: STATUS.find((s) => s[0] === x.status)?.[2] || C.text, fontSize: 12, padding: '3px 4px' }}
        >
          {STATUS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>
      {x.status === 'received' && (
        <input
          defaultValue={x.note}
          placeholder="Note: which file, anything missing"
          onBlur={(e) => e.target.value !== x.note && setItem(x.id, { note: e.target.value })}
          style={{ ...inputStyle, marginTop: 5, fontSize: 12, padding: '5px 8px' }}
        />
      )}
    </div>
  );

  return (
    <div style={{ background: C.inner, border: `1px solid ${C.green}55`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.green, marginBottom: 8 }}>
        <Lock size={12} /> Only you can see this section
        <span style={{ marginLeft: 'auto', color: C.muted }}>{saving ? 'Saving…' : ''}</span>
      </div>

      <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>
        Requested from the battery engineer: <strong>{received} of {priority.length}</strong> received
      </div>
      {data.request_doc_url && (
        <a href={data.request_doc_url} target="_blank" rel="noreferrer" style={{ ...linkBtn, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
          Open the request document <ExternalLink size={11} />
        </a>
      )}
      <div style={{ marginTop: 8 }}>{priority.map(row)}</div>

      <button onClick={() => setShowLater((v) => !v)} style={{ ...linkBtn, fontSize: 12, marginTop: 8 }}>
        {showLater ? 'Hide' : 'Show'} questions for later ({later.length})
      </button>
      {showLater && <div style={{ marginTop: 4 }}>{later.map(row)}</div>}

      <div style={{ fontSize: 12, color: C.text, margin: '14px 0 4px' }}>What we already know</div>
      <textarea
        defaultValue={data.known}
        rows={4}
        onBlur={(e) => e.target.value !== data.known && save({ known: e.target.value })}
        style={{ ...inputStyle, resize: 'vertical', fontSize: 12, lineHeight: 1.5 }}
      />

      <div style={{ fontSize: 12, color: C.text, margin: '14px 0 6px' }}>Documents from the manufacturer</div>
      <button onClick={() => inputRef.current?.click()} disabled={!!busy} style={{ ...btnStyle(), fontSize: 12 }}>
        <Upload size={13} /> {busy || 'Upload files'}
      </button>
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Datasheets, SOP / OCV tables, fault-code lists, DBC files. Up to 50 MB each.</div>
      {data.files.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {data.files.map((f) => (
            <div key={f.path} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '5px 0', borderTop: `1px solid ${C.border}` }}>
              <FileText size={13} color={C.muted} style={{ flexShrink: 0 }} />
              <button onClick={() => download(f)} style={{ ...linkBtn, fontSize: 12, textAlign: 'left', wordBreak: 'break-all' }}>{f.name}</button>
              <span style={{ color: C.muted, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmtDate(f.uploaded_at)}</span>
              <button onClick={() => remove(f)} style={{ ...linkBtn, color: C.muted }} title="Delete"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

const inputStyle = { width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none' };
