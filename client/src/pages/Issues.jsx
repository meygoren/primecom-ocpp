import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0f1117', card: '#1a1d27', panel: '#22263a', border: '#2e3347',
  text: '#f1f5f9', muted: '#8892a4',
  green: '#47a141', blue: '#3b82f6', amber: '#f59e0b', red: '#ef4444', purple: '#a855f7',
};

const PRIORITY_META = {
  low:    { label: 'Low',    color: C.blue,  bg: '#3b82f618', border: '#3b82f644' },
  medium: { label: 'Medium', color: C.amber, bg: '#f59e0b18', border: '#f59e0b44' },
  high:   { label: 'High',   color: C.red,   bg: '#ef444418', border: '#ef444444' },
};

const STATUS_META = {
  open:        { label: 'Open',        color: C.amber,  bg: '#f59e0b18' },
  in_progress: { label: 'In Progress', color: C.blue,   bg: '#3b82f618' },
  resolved:    { label: 'Resolved',    color: C.green,  bg: '#47a14118' },
  closed:      { label: 'Closed',      color: C.muted,  bg: '#6b728018' },
};

const CATEGORIES = [
  { value: 'charger',    label: 'Charger issue' },
  { value: 'vehicle',    label: 'Vehicle issue' },
  { value: 'operations', label: 'Operations / business' },
  { value: 'other',      label: 'Other (describe below)' },
];

function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.medium;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: m.color, background: m.bg, border: `1px solid ${m.border}`, borderRadius: 999, padding: '2px 9px' }}>
      {m.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.open;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: m.color, background: m.bg, borderRadius: 999, padding: '2px 9px', border: `1px solid ${m.color}44` }}>
      {m.label}
    </span>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ── New Issue Modal ───────────────────────────────────────────────────────────
function NewIssueModal({ trucks, onClose, onCreated, reporterName }) {
  const [form, setForm] = useState({
    truck_number: '',
    truck_side:   '',
    cable:        '',
    category:     'charger',
    title:        '',
    description:  '',
    priority:     'medium',
  });
  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState(null);
  const fileRef = useRef();

  function setField(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  function onPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function uploadPhoto() {
    if (!photoFile) return null;
    const ext  = photoFile.name.split('.').pop();
    const path = `issues/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('issue-photos').upload(path, photoFile, { upsert: false });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    const { data } = supabase.storage.from('issue-photos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function submit() {
    if (!form.description.trim() && !form.title.trim()) {
      setError('Please describe the issue.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setUploading(true);
      const photo_url = await uploadPhoto();
      setUploading(false);

      const payload = {
        ...form,
        truck_number: form.truck_number ? parseInt(form.truck_number) : null,
        photo_url,
        reporter_name: reporterName,
      };

      await api.createIssue(payload);
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
      setUploading(false);
    } finally {
      setSubmitting(false);
    }
  }

  const fieldLabel = (text, required) => (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.muted, marginBottom: 6 }}>
      {text}{required && <span style={{ color: C.red }}> *</span>}
    </div>
  );

  const select = (key, options, placeholder) => (
    <select
      value={form[key]}
      onChange={(e) => setField(key, e.target.value)}
      style={{ width: '100%', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: form[key] ? C.text : C.muted, fontSize: 13 }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Report New Issue</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Truck + side + cable row */}
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 10 }}>
            <div>
              {fieldLabel('Truck')}
              {select('truck_number', trucks.map((t) => ({ value: String(t.truck_number), label: `Truck ${t.truck_number}${t.label ? ` — ${t.label}` : ''}` })), 'No truck / general')}
            </div>
            <div>
              {fieldLabel('Side')}
              {select('truck_side', [
                { value: 'passenger', label: 'Passenger side' },
                { value: 'driver',    label: 'Driver side' },
                { value: 'both',      label: 'Both sides' },
                { value: 'general',   label: 'General' },
              ], 'Select side')}
            </div>
            <div>
              {fieldLabel('Cable')}
              {select('cable', [
                { value: 'A',       label: 'Cable A' },
                { value: 'B',       label: 'Cable B' },
                { value: 'both',    label: 'Both cables' },
                { value: 'general', label: 'General' },
              ], 'Select cable')}
            </div>
          </div>

          {/* Category */}
          <div>
            {fieldLabel('Category', true)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setField('category', c.value)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: `1px solid ${form.category === c.value ? C.green : C.border}`,
                    background: form.category === c.value ? '#47a14122' : C.panel,
                    color: form.category === c.value ? C.green : C.muted,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            {fieldLabel('Short title')}
            <input
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="e.g. Cable A not connecting on Truck 6 driver side"
              style={{ width: '100%', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          {/* Description */}
          <div>
            {fieldLabel('Description', true)}
            <textarea
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Describe what happened, what you tried, and any relevant details..."
              rows={4}
              style={{ width: '100%', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {/* Photo */}
          <div>
            {fieldLabel('Photo (optional)')}
            {photoPreview ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={photoPreview} alt="Preview" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: C.red, border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >×</button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                style={{ padding: '9px 16px', background: C.panel, border: `1px dashed ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 12, cursor: 'pointer' }}
              >
                + Attach photo
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPhotoChange} />
          </div>

          {/* Priority */}
          <div>
            {fieldLabel('Priority', true)}
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(PRIORITY_META).map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => setField('priority', key)}
                  style={{
                    flex: 1,
                    padding: '9px 8px',
                    borderRadius: 8,
                    border: `1px solid ${form.priority === key ? m.color : C.border}`,
                    background: form.priority === key ? m.bg : C.panel,
                    color: form.priority === key ? m.color : C.muted,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
              High → immediate email alert. Medium → alert if enabled. Low → logged only.
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#ef444418', border: `1px solid #ef444444`, borderRadius: 8, color: C.red, fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            style={{ padding: '9px 24px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1 }}
          >
            {uploading ? 'Uploading photo…' : submitting ? 'Submitting…' : 'Submit Issue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Issue Detail Panel ────────────────────────────────────────────────────────
function IssueDetail({ issue, onClose, onUpdated, isAdmin }) {
  const [status, setStatus] = useState(issue.status);
  const [notes,  setNotes]  = useState(issue.resolution_notes || '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateIssue(issue.id, { status, resolution_notes: notes });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdated();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const row = (label, value) => value ? (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: C.muted, width: 100, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '.06em', paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: C.text, wordBreak: 'break-word', minWidth: 0, flex: 1 }}>{value}</span>
    </div>
  ) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6, wordBreak: 'break-word' }}>
              {issue.title || `${CATEGORIES.find((c) => c.value === issue.category)?.label || 'Issue'}`}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <PriorityBadge priority={issue.priority} />
              <StatusBadge status={issue.status} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', flexShrink: 0 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {row('Reported',  timeAgo(issue.created_at))}
          {row('Reporter',  issue.reporter_name)}
          {row('Truck',     issue.truck_number ? `Truck ${issue.truck_number}` : null)}
          {row('Side',      issue.truck_side)}
          {row('Cable',     issue.cable)}
          {row('Category',  CATEGORIES.find((c) => c.value === issue.category)?.label)}

          <div style={{ margin: '16px 0' }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Description</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, background: C.panel, borderRadius: 8, padding: '12px 14px' }}>
              {issue.description || '—'}
            </div>
          </div>

          {issue.photo_url && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Photo</div>
              <a href={issue.photo_url} target="_blank" rel="noreferrer">
                <img src={issue.photo_url} alt="Issue" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}` }} />
              </a>
            </div>
          )}

          {isAdmin && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Update Status</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(STATUS_META).map(([key, m]) => (
                    <button
                      key={key}
                      onClick={() => setStatus(key)}
                      style={{
                        padding: '6px 14px', borderRadius: 7,
                        border: `1px solid ${status === key ? m.color : C.border}`,
                        background: status === key ? m.bg : C.panel,
                        color: status === key ? m.color : C.muted,
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Resolution Notes</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What was done to resolve this issue..."
                  rows={3}
                  style={{ width: '100%', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>

              <button
                onClick={save}
                disabled={saving}
                style={{ padding: '9px 22px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function IssueSettingsPanel({ onClose }) {
  const [settings, setSettings] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    api.getIssueSettings().then(setSettings).catch(() => {});
  }, []);

  function setField(key, val) { setSettings((s) => ({ ...s, [key]: val })); }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...settings,
        low_emails:    (settings.low_emails_raw    || '').split(',').map((e) => e.trim()).filter(Boolean),
        medium_emails: (settings.medium_emails_raw || '').split(',').map((e) => e.trim()).filter(Boolean),
        high_emails:   (settings.high_emails_raw   || '').split(',').map((e) => e.trim()).filter(Boolean),
      };
      await api.saveIssueSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Init raw email strings from array on first load
  useEffect(() => {
    if (!settings) return;
    if (settings.low_emails_raw === undefined) {
      setSettings((s) => ({
        ...s,
        low_emails_raw:    (s.low_emails || []).join(', '),
        medium_emails_raw: (s.medium_emails || []).join(', '),
        high_emails_raw:   (s.high_emails || []).join(', '),
      }));
    }
  }, [settings]);

  if (!settings) return <div style={{ padding: 20, color: C.muted }}>Loading…</div>;

  const toggle = (key) => (
    <button
      onClick={() => setField(key, !settings[key])}
      style={{ width: 40, height: 22, borderRadius: 999, border: 'none', background: settings[key] ? C.green : C.border, position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 2, left: settings[key] ? 19 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </button>
  );

  const block = (label, enableKey, emailKey, color) => (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label} Priority Alerts</span>
        </div>
        {toggle(enableKey)}
      </div>
      {settings[enableKey] && (
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Send alerts to (comma-separated):</div>
          <textarea
            value={settings[emailKey] || ''}
            onChange={(e) => setField(emailKey, e.target.value)}
            placeholder="ops@company.com, supervisor@company.com"
            rows={2}
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontSize: 12, resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="px-4 py-5 md:px-7 md:py-6" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Issue Alert Settings</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14 }}>Hide</button>
      </div>

      {block('High',   'high_enabled',   'high_emails_raw',   C.red)}
      {block('Medium', 'medium_enabled', 'medium_emails_raw', C.amber)}
      {block('Low',    'low_enabled',    'low_emails_raw',    C.blue)}

      <button
        onClick={save}
        disabled={saving}
        style={{ marginTop: 8, padding: '9px 22px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save Settings'}
      </button>
    </div>
  );
}

// ── Main Issues page ──────────────────────────────────────────────────────────
export default function Issues() {
  const profile = useProfile();
  const role    = profile?.role;
  const isAdmin = role === 'admin' || role === 'operator';

  const [issues,      setIssues]      = useState([]);
  const [trucks,      setTrucks]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showNew,        setShowNew]        = useState(false);
  const [selected,       setSelected]       = useState(null);
  const [showSettings,   setShowSettings]   = useState(false);

  const load = useCallback(async () => {
    try {
      const params = [];
      if (filterStatus)   params.push(`status=${filterStatus}`);
      if (filterPriority) params.push(`priority=${filterPriority}`);
      const query = params.length ? `?${params.join('&')}` : '';
      const [issueData, truckData] = await Promise.all([
        api.getIssues(query),
        api.getChargeTrucks().catch(() => []),
      ]);
      setIssues(issueData);
      setTrucks(truckData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority]);

  useEffect(() => { load(); }, [load]);

  const openCount  = issues.filter((i) => i.status === 'open').length;
  const inProgCount = issues.filter((i) => i.status === 'in_progress').length;
  const highCount  = issues.filter((i) => i.priority === 'high' && i.status !== 'resolved' && i.status !== 'closed').length;

  return (
    <div className="px-4 py-5 md:px-9 md:py-8" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Issues</h1>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Driver and field issue tracker</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && (
            <button
              onClick={() => setShowSettings((s) => !s)}
              style={{ padding: '8px 16px', background: showSettings ? '#2d5c2a33' : C.panel, border: `1px solid ${showSettings ? C.green : C.border}`, borderRadius: 8, color: showSettings ? C.green : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Alert Settings
            </button>
          )}
          <button
            onClick={() => setShowNew(true)}
            style={{ padding: '8px 18px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            + Report Issue
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 14, marginBottom: 24 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Open Issues</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: openCount > 0 ? C.amber : C.green }}>{openCount}</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>In Progress</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: inProgCount > 0 ? C.blue : C.muted }}>{inProgCount}</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>High Priority Open</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: highCount > 0 ? C.red : C.muted }}>{highCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { label: 'All Status', value: '' },
          { label: 'Open', value: 'open' },
          { label: 'In Progress', value: 'in_progress' },
          { label: 'Resolved', value: 'resolved' },
          { label: 'Closed', value: 'closed' },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilterStatus(opt.value)}
            style={{ padding: '5px 14px', borderRadius: 7, border: `1px solid ${filterStatus === opt.value ? C.green : C.border}`, background: filterStatus === opt.value ? '#47a14122' : 'transparent', color: filterStatus === opt.value ? C.green : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {opt.label}
          </button>
        ))}
        <div style={{ width: 1, background: C.border }} />
        {[
          { label: 'All Priority', value: '' },
          { label: 'High', value: 'high' },
          { label: 'Medium', value: 'medium' },
          { label: 'Low', value: 'low' },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilterPriority(opt.value)}
            style={{ padding: '5px 14px', borderRadius: 7, border: `1px solid ${filterPriority === opt.value ? C.green : C.border}`, background: filterPriority === opt.value ? '#47a14122' : 'transparent', color: filterPriority === opt.value ? C.green : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Issues list */}
      {loading ? (
        <div style={{ color: C.muted, padding: 40 }}>Loading issues...</div>
      ) : issues.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: C.muted }}>
          <div style={{ fontSize: 32, marginBottom: 12, color: C.border }}>—</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No issues found</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Tap "Report Issue" to log the first one.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {issues.map((issue) => (
            <div
              key={issue.id}
              onClick={() => setSelected(issue)}
              style={{
                background: C.card,
                border: `1px solid ${issue.priority === 'high' && issue.status === 'open' ? '#ef444433' : C.border}`,
                borderRadius: 12,
                padding: '14px 18px',
                cursor: 'pointer',
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                transition: 'border-color 0.15s',
              }}
            >
              {/* Priority stripe */}
              <div style={{ width: 3, borderRadius: 2, alignSelf: 'stretch', background: PRIORITY_META[issue.priority]?.color || C.muted, flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text, wordBreak: 'break-word' }}>
                    {issue.title || CATEGORIES.find((c) => c.value === issue.category)?.label || 'Issue'}
                  </span>
                  <PriorityBadge priority={issue.priority} />
                  <StatusBadge status={issue.status} />
                </div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {[
                    issue.truck_number ? `Truck ${issue.truck_number}` : null,
                    issue.truck_side,
                    issue.cable ? `Cable ${issue.cable}` : null,
                  ].filter(Boolean).join(' · ')}
                  {issue.reporter_name && <span> · {issue.reporter_name}</span>}
                </div>
                {issue.description && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {issue.description}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 11, color: C.muted, flexShrink: 0, textAlign: 'right' }}>
                <div>{timeAgo(issue.created_at)}</div>
                {issue.photo_url && <div style={{ marginTop: 4, color: C.blue }}>Photo</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settings panel */}
      {isAdmin && showSettings && <IssueSettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Modals */}
      {showNew && (
        <NewIssueModal
          trucks={trucks}
          reporterName={profile?.full_name || profile?.email || ''}
          onClose={() => setShowNew(false)}
          onCreated={load}
        />
      )}
      {selected && (
        <IssueDetail
          issue={selected}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onUpdated={() => { load(); setSelected(null); }}
        />
      )}
    </div>
  );
}
