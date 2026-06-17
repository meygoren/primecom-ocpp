import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { FileText, Send, Bell, Settings, Plus, RefreshCw, Trash2, AlertCircle, CheckCircle, Clock, XCircle, ChevronDown, Mail, Eye } from 'lucide-react';

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_TEMPLATES = [
  { templateId: 'demo-tpl-001', name: 'Non-Disclosure Agreement (NDA)', description: 'Standard Primecom NDA for customers and partners' },
  { templateId: 'demo-tpl-002', name: 'Service Agreement', description: 'EV charger installation and maintenance agreement' },
  { templateId: 'demo-tpl-003', name: 'Reseller Agreement', description: 'Authorized reseller terms and conditions' },
  { templateId: 'demo-tpl-004', name: 'Warranty Extension', description: 'Extended warranty agreement for commercial accounts' },
];

const DEMO_DOCUMENTS = [
  {
    id: 'demo-doc-001',
    envelope_id: 'env-1a2b3c',
    template_name: 'Non-Disclosure Agreement (NDA)',
    recipient_name: 'John Smith',
    recipient_email: 'john.smith@acmecorp.com',
    subject: 'Please sign: Non-Disclosure Agreement',
    status: 'completed',
    sent_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-doc-002',
    envelope_id: 'env-4d5e6f',
    template_name: 'Service Agreement',
    recipient_name: 'Maria Garcia',
    recipient_email: 'mgarcia@techfleet.io',
    subject: 'Please sign: Service Agreement',
    status: 'sent',
    sent_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    completed_at: null,
  },
  {
    id: 'demo-doc-003',
    envelope_id: 'env-7g8h9i',
    template_name: 'Non-Disclosure Agreement (NDA)',
    recipient_name: 'Robert Chen',
    recipient_email: 'r.chen@evpartners.com',
    subject: 'Please sign: Non-Disclosure Agreement',
    status: 'delivered',
    sent_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    completed_at: null,
  },
  {
    id: 'demo-doc-004',
    envelope_id: 'env-jkl012',
    template_name: 'Reseller Agreement',
    recipient_name: 'Sarah Wilson',
    recipient_email: 'swilson@greendrive.net',
    subject: 'Please sign: Reseller Agreement',
    status: 'voided',
    sent_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    voided_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-doc-005',
    envelope_id: 'env-mno345',
    template_name: 'Service Agreement',
    recipient_name: 'David Park',
    recipient_email: 'dpark@logisticspro.com',
    subject: 'Please sign: Service Agreement',
    status: 'declined',
    sent_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    completed_at: null,
  },
];

const DEMO_NOTIFICATIONS = [
  {
    id: 'demo-notif-001',
    type: 'document_signed',
    message: 'John Smith (john.smith@acmecorp.com) completed signing the NDA.',
    recipient_email: 'legal@primecom.tech',
    is_read: true,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-notif-002',
    type: 'alert',
    message: 'New NDA sent to Maria Garcia at TechFleet. Pending signature.',
    recipient_email: 'legal@primecom.tech',
    is_read: false,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-notif-003',
    type: 'alert',
    message: 'Reseller Agreement with Sarah Wilson was voided. Please follow up.',
    recipient_email: 'legal@primecom.tech',
    is_read: false,
    created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const DEMO_SETTINGS = {
  configured: true,
  docusign_account_id: 'demo-account-12345',
  docusign_base_url: 'https://demo.docusign.net',
  nda_template_id: 'demo-tpl-001',
  has_token: true,
  counsel_emails: ['legal@primecom.tech', 'mehmet@primecom.tech'],
  custom_templates: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function relTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const STATUS_CONFIG = {
  sent:      { label: 'Sent',      color: '#3b82f6', bg: '#1e3a5f', icon: Send },
  delivered: { label: 'Delivered', color: '#f59e0b', bg: '#3d2e0a', icon: Eye },
  completed: { label: 'Signed',    color: '#47a141', bg: '#1a3317', icon: CheckCircle },
  voided:    { label: 'Voided',    color: '#6b7280', bg: '#1f2937', icon: XCircle },
  declined:  { label: 'Declined',  color: '#ef4444', bg: '#3b1010', icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#8892a4', bg: '#22263a', icon: Clock };
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 700,
      color: cfg.color,
      background: cfg.bg,
    }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

// ─── Tab: Documents ───────────────────────────────────────────────────────────
function DocumentsTab({ demo }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (demo) {
        setDocs(DEMO_DOCUMENTS);
      } else {
        const data = await api.getLegalDocuments();
        setDocs(data);
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [demo]);

  useEffect(() => { load(); }, [load]);

  async function handleVoid(doc) {
    if (!window.confirm(`Void envelope for ${doc.recipient_name}? This cannot be undone.`)) return;
    setActionLoading(doc.id + '-void');
    try {
      if (!demo) {
        await api.voidLegalDocument(doc.id, 'Voided by legal team');
        await load();
      } else {
        setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: 'voided', voided_at: new Date().toISOString() } : d));
      }
      setMsg({ type: 'ok', text: 'Envelope voided.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemind(doc) {
    setActionLoading(doc.id + '-remind');
    try {
      if (!demo) {
        await api.remindLegalDocument(doc.id);
      }
      setMsg({ type: 'ok', text: `Reminder sent to ${doc.recipient_email}.` });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  async function handleRefreshStatus(doc) {
    setActionLoading(doc.id + '-status');
    try {
      if (!demo) {
        const result = await api.refreshLegalDocStatus(doc.id);
        setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: result.status } : d));
        setMsg({ type: 'ok', text: `Status: ${result.status}` });
      } else {
        setMsg({ type: 'ok', text: 'Demo mode: status unchanged.' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#8892a4' }}>{docs.length} document{docs.length !== 1 ? 's' : ''}</div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {msg && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: msg.type === 'error' ? '#3b1010' : '#1a3317', color: msg.type === 'error' ? '#ef4444' : '#47a141', fontSize: 13, border: `1px solid ${msg.type === 'error' ? '#ef444440' : '#47a14140'}` }}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#8892a4', fontSize: 13, padding: 32, textAlign: 'center' }}>Loading...</div>
      ) : docs.length === 0 ? (
        <div style={{ color: '#8892a4', fontSize: 13, padding: 32, textAlign: 'center' }}>No documents sent yet. Use the "Send Document" tab to get started.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2e3347' }}>
                {['Recipient', 'Template', 'Subject', 'Status', 'Sent', 'Completed', 'Actions'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#8892a4', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} style={{ borderBottom: '1px solid #1e2236' }}>
                  <td style={{ padding: '10px 12px', color: '#f1f5f9' }}>
                    <div style={{ fontWeight: 600 }}>{doc.recipient_name}</div>
                    <div style={{ fontSize: 11, color: '#8892a4' }}>{doc.recipient_email}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#c1c9d8', maxWidth: 180 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.template_name || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#8892a4', maxWidth: 200 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.subject || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <StatusBadge status={doc.status} />
                  </td>
                  <td style={{ padding: '10px 12px', color: '#8892a4', whiteSpace: 'nowrap' }}>{fmtDate(doc.sent_at)}</td>
                  <td style={{ padding: '10px 12px', color: doc.completed_at ? '#47a141' : '#8892a4', whiteSpace: 'nowrap' }}>
                    {doc.status === 'voided' ? fmtDate(doc.voided_at) : fmtDate(doc.completed_at)}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['sent', 'delivered'].includes(doc.status) && (
                        <>
                          <button
                            onClick={() => handleRemind(doc)}
                            disabled={actionLoading === doc.id + '-remind'}
                            style={{ padding: '4px 10px', background: '#1e3a5f', border: '1px solid #2563eb40', borderRadius: 5, color: '#3b82f6', fontSize: 11, cursor: 'pointer' }}
                          >
                            {actionLoading === doc.id + '-remind' ? '...' : 'Remind'}
                          </button>
                          <button
                            onClick={() => handleVoid(doc)}
                            disabled={actionLoading === doc.id + '-void'}
                            style={{ padding: '4px 10px', background: '#3b1010', border: '1px solid #ef444440', borderRadius: 5, color: '#ef4444', fontSize: 11, cursor: 'pointer' }}
                          >
                            {actionLoading === doc.id + '-void' ? '...' : 'Void'}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleRefreshStatus(doc)}
                        disabled={actionLoading === doc.id + '-status'}
                        style={{ padding: '4px 10px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 5, color: '#8892a4', fontSize: 11, cursor: 'pointer' }}
                      >
                        {actionLoading === doc.id + '-status' ? '...' : <RefreshCw size={11} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Send Document ───────────────────────────────────────────────────────
function SendTab({ demo, settings, onDocSent }) {
  const [templates, setTemplates] = useState([]);
  const [loadingTpls, setLoadingTpls] = useState(true);
  const [templateId, setTemplateId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    async function loadTemplates() {
      setLoadingTpls(true);
      try {
        if (demo) {
          setTemplates(DEMO_TEMPLATES);
        } else {
          const data = await api.getLegalTemplates();
          setTemplates(data);
        }
      } catch {
        setTemplates([]);
      } finally {
        setLoadingTpls(false);
      }
    }
    loadTemplates();
  }, [demo]);

  const selectedTemplate = templates.find((t) => t.templateId === templateId);

  function handleTemplateChange(e) {
    const id = e.target.value;
    setTemplateId(id);
    const tpl = templates.find((t) => t.templateId === id);
    if (tpl && !subject) setSubject(`Please sign: ${tpl.name}`);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!templateId || !recipientName || !recipientEmail) return;
    setSending(true);
    setResult(null);
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 800));
        const fakDoc = {
          id: 'demo-new-' + Date.now(),
          envelope_id: 'env-demo-' + Math.random().toString(36).slice(2, 8),
          template_name: selectedTemplate?.name,
          recipient_name: recipientName,
          recipient_email: recipientEmail,
          subject: subject || `Please sign: ${selectedTemplate?.name}`,
          status: 'sent',
          sent_at: new Date().toISOString(),
        };
        setResult({ type: 'ok', envelopeId: fakDoc.envelope_id, doc: fakDoc });
        if (onDocSent) onDocSent(fakDoc);
      } else {
        const res = await api.sendLegalDocument({
          template_id: templateId,
          template_name: selectedTemplate?.name,
          recipient_name: recipientName,
          recipient_email: recipientEmail,
          subject,
          message,
        });
        setResult({ type: 'ok', envelopeId: res.envelopeId, doc: res.doc });
        if (onDocSent) onDocSent(res.doc);
      }
      setRecipientName('');
      setRecipientEmail('');
      setSubject('');
      setMessage('');
    } catch (err) {
      setResult({ type: 'error', text: err.message });
    } finally {
      setSending(false);
    }
  }

  if (!demo && !settings?.configured) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#8892a4' }}>
        <AlertCircle size={32} style={{ marginBottom: 12, color: '#f59e0b' }} />
        <div style={{ marginBottom: 8, fontSize: 14, color: '#f1f5f9' }}>DocuSign not configured</div>
        <div style={{ fontSize: 13 }}>Go to the Settings tab to add your DocuSign credentials.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {result && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          borderRadius: 8,
          background: result.type === 'error' ? '#3b1010' : '#1a3317',
          color: result.type === 'error' ? '#ef4444' : '#47a141',
          fontSize: 13,
          border: `1px solid ${result.type === 'error' ? '#ef444440' : '#47a14140'}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {result.type === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {result.type === 'ok'
            ? `Document sent successfully. Envelope ID: ${result.envelopeId}`
            : result.text}
        </div>
      )}

      <form onSubmit={handleSend}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Document Template *
          </label>
          {loadingTpls ? (
            <div style={{ padding: '10px 12px', background: '#22263a', borderRadius: 7, color: '#8892a4', fontSize: 13 }}>Loading templates...</div>
          ) : (
            <select
              value={templateId}
              onChange={handleTemplateChange}
              required
              style={{ width: '100%', padding: '10px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, color: '#f1f5f9', fontSize: 13 }}
            >
              <option value="">-- Select a template --</option>
              {templates.map((t) => (
                <option key={t.templateId} value={t.templateId}>{t.name}</option>
              ))}
            </select>
          )}
          {selectedTemplate?.description && (
            <div style={{ marginTop: 5, fontSize: 11, color: '#8892a4' }}>{selectedTemplate.description}</div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Recipient Name *
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              required
              placeholder="Full name"
              style={{ width: '100%', padding: '10px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Recipient Email *
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              required
              placeholder="email@company.com"
              style={{ width: '100%', padding: '10px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Email Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Auto-filled from template"
            style={{ width: '100%', padding: '10px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Personal Message (optional)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Add a note to the email..."
            style={{ width: '100%', padding: '10px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <button
          type="submit"
          disabled={sending || !templateId || !recipientName || !recipientEmail}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: sending ? '#2d5c2a' : '#47a141',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: sending ? 'wait' : 'pointer',
            opacity: (!templateId || !recipientName || !recipientEmail) ? 0.5 : 1,
          }}
        >
          <Send size={15} />
          {sending ? 'Sending...' : 'Send for Signature'}
        </button>
      </form>
    </div>
  );
}

// ─── Tab: Notifications ───────────────────────────────────────────────────────
function NotificationsTab({ demo, settings }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composeTo, setComposeTo] = useState('');
  const [composeMsg, setComposeMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState(null);

  const counselEmails = settings?.counsel_emails || [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (demo) {
        setNotifs(DEMO_NOTIFICATIONS);
      } else {
        const data = await api.getLegalNotifications();
        setNotifs(data);
      }
    } catch {
      setNotifs([]);
    } finally {
      setLoading(false);
    }
  }, [demo]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id) {
    if (!demo) await api.markLegalNotificationRead(id);
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  }

  function buildMailtoLink(to, msg) {
    const params = new URLSearchParams({ to, subject: 'Legal Alert — Primecom', body: msg });
    return `mailto:${to}?subject=${encodeURIComponent('Legal Alert — Primecom')}&body=${encodeURIComponent(msg)}`;
  }

  async function handleSendAlert(e) {
    e.preventDefault();
    if (!composeTo || !composeMsg) return;
    setSending(true);
    setSentMsg(null);
    try {
      if (!demo) {
        await api.createLegalNotification({ type: 'alert', message: composeMsg, recipient_email: composeTo });
      }
      // Open the mailto link so the user's email client fires
      window.open(buildMailtoLink(composeTo, composeMsg), '_blank');
      const newNotif = {
        id: 'new-' + Date.now(),
        type: 'alert',
        message: composeMsg,
        recipient_email: composeTo,
        is_read: false,
        created_at: new Date().toISOString(),
      };
      setNotifs((prev) => [newNotif, ...prev]);
      setComposeMsg('');
      setSentMsg({ type: 'ok', text: `Alert sent to ${composeTo} and logged.` });
    } catch (err) {
      setSentMsg({ type: 'error', text: err.message });
    } finally {
      setSending(false);
      setTimeout(() => setSentMsg(null), 4000);
    }
  }

  const NOTIF_TYPE_COLORS = {
    alert: '#f59e0b',
    document_signed: '#47a141',
    document_voided: '#6b7280',
    custom: '#3b82f6',
  };

  return (
    <div>
      {/* Compose Alert */}
      <div style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 10, padding: 18, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 14 }}>Alert Legal Counsel</div>
        {counselEmails.length === 0 && (
          <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 10 }}>
            No counsel emails configured. Add them in the Settings tab.
          </div>
        )}
        <form onSubmit={handleSendAlert}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#8892a4', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>To</label>
              <select
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                required
                style={{ width: '100%', padding: '9px 10px', background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 7, color: '#f1f5f9', fontSize: 12 }}
              >
                <option value="">Select email</option>
                {counselEmails.map((em) => <option key={em} value={em}>{em}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#8892a4', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>Message</label>
              <input
                type="text"
                value={composeMsg}
                onChange={(e) => setComposeMsg(e.target.value)}
                required
                placeholder="Urgent: customer has not signed NDA — please follow up"
                style={{ width: '100%', padding: '9px 10px', background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 7, color: '#f1f5f9', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="submit"
              disabled={sending || !composeTo || !composeMsg}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#47a141', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!composeTo || !composeMsg) ? 0.5 : 1, whiteSpace: 'nowrap' }}
            >
              <Mail size={13} />
              {sending ? '...' : 'Send Alert'}
            </button>
          </div>
        </form>
        {sentMsg && (
          <div style={{ marginTop: 10, fontSize: 12, color: sentMsg.type === 'error' ? '#ef4444' : '#47a141' }}>{sentMsg.text}</div>
        )}
      </div>

      {/* Log */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#8892a4' }}>
          Notification log — {notifs.filter((n) => !n.is_read).length} unread
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 6, color: '#8892a4', fontSize: 11, cursor: 'pointer' }}>
          <RefreshCw size={11} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#8892a4', fontSize: 13, padding: 24, textAlign: 'center' }}>Loading...</div>
      ) : notifs.length === 0 ? (
        <div style={{ color: '#8892a4', fontSize: 13, padding: 24, textAlign: 'center' }}>No notifications yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifs.map((n) => (
            <div
              key={n.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                background: n.is_read ? '#1a1d27' : '#22263a',
                border: `1px solid ${n.is_read ? '#2e334740' : '#2e3347'}`,
                borderRadius: 8,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: NOTIF_TYPE_COLORS[n.type] || '#8892a4', flexShrink: 0, marginTop: 4 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: n.is_read ? '#8892a4' : '#f1f5f9', lineHeight: 1.5 }}>{n.message}</div>
                <div style={{ fontSize: 11, color: '#4b5568', marginTop: 3 }}>
                  {n.recipient_email && <span style={{ marginRight: 10 }}>To: {n.recipient_email}</span>}
                  {relTime(n.created_at)}
                </div>
              </div>
              {!n.is_read && (
                <button
                  onClick={() => markRead(n.id)}
                  style={{ padding: '3px 10px', background: 'transparent', border: '1px solid #2e3347', borderRadius: 5, color: '#8892a4', fontSize: 11, cursor: 'pointer' }}
                >
                  Dismiss
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Settings ────────────────────────────────────────────────────────────
function SettingsTab({ demo, onSettingsChange }) {
  const [form, setForm] = useState({
    docusign_access_token: '',
    docusign_account_id: '',
    docusign_base_url: 'https://demo.docusign.net',
    nda_template_id: '',
    counsel_emails_raw: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        if (demo) {
          setForm({
            docusign_access_token: '',
            docusign_account_id: DEMO_SETTINGS.docusign_account_id,
            docusign_base_url: DEMO_SETTINGS.docusign_base_url,
            nda_template_id: DEMO_SETTINGS.nda_template_id,
            counsel_emails_raw: DEMO_SETTINGS.counsel_emails.join('\n'),
          });
        } else {
          const data = await api.getLegalSettings();
          setForm({
            docusign_access_token: '',
            docusign_account_id: data.docusign_account_id || '',
            docusign_base_url: data.docusign_base_url || 'https://demo.docusign.net',
            nda_template_id: data.nda_template_id || '',
            counsel_emails_raw: (data.counsel_emails || []).join('\n'),
          });
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, [demo]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const emails = form.counsel_emails_raw
      .split(/[\n,]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    try {
      if (!demo) {
        await api.saveLegalSettings({
          docusign_access_token: form.docusign_access_token || undefined,
          docusign_account_id: form.docusign_account_id,
          docusign_base_url: form.docusign_base_url,
          nda_template_id: form.nda_template_id,
          counsel_emails: emails,
        });
        if (onSettingsChange) onSettingsChange();
      }
      setMsg({ type: 'ok', text: demo ? 'Demo mode: settings not persisted.' : 'Settings saved.' });
      setForm((f) => ({ ...f, docusign_access_token: '' }));
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  const field = (label, key, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={key === 'docusign_access_token' && !showToken ? 'password' : type}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          style={{ width: '100%', padding: '10px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }}
        />
        {key === 'docusign_access_token' && (
          <button
            type="button"
            onClick={() => setShowToken((s) => !s)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8892a4', cursor: 'pointer', fontSize: 11 }}
          >
            {showToken ? 'hide' : 'show'}
          </button>
        )}
      </div>
    </div>
  );

  if (loading) return <div style={{ color: '#8892a4', fontSize: 13, padding: 32 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 520 }}>
      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: msg.type === 'error' ? '#3b1010' : '#1a3317', color: msg.type === 'error' ? '#ef4444' : '#47a141', fontSize: 13, border: `1px solid ${msg.type === 'error' ? '#ef444440' : '#47a14140'}` }}>
          {msg.text}
        </div>
      )}

      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#8892a4', lineHeight: 1.6 }}>
          To connect DocuSign: go to your DocuSign developer account, generate an OAuth access token under Admin &rarr; API and Keys, then enter the token below. Use <strong style={{ color: '#f1f5f9' }}>https://www.docusign.net</strong> for production or <strong style={{ color: '#f1f5f9' }}>https://demo.docusign.net</strong> for sandbox.
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            DocuSign Access Token {!demo && <span style={{ color: '#4b5568', fontWeight: 400 }}>(leave blank to keep existing)</span>}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showToken ? 'text' : 'password'}
              value={form.docusign_access_token}
              onChange={(e) => setForm((f) => ({ ...f, docusign_access_token: e.target.value }))}
              placeholder="ey..."
              style={{ width: '100%', padding: '10px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowToken((s) => !s)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8892a4', cursor: 'pointer', fontSize: 11 }}
            >
              {showToken ? 'hide' : 'show'}
            </button>
          </div>
        </div>

        {field('DocuSign Account ID', 'docusign_account_id', 'text', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}
        {field('DocuSign Base URL', 'docusign_base_url', 'text', 'https://www.docusign.net')}
        {field('Default NDA Template ID', 'nda_template_id', 'text', 'Template ID from DocuSign')}

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Legal Counsel Emails
            <span style={{ marginLeft: 8, fontSize: 10, color: '#4b5568', fontWeight: 400, textTransform: 'none' }}>one per line</span>
          </label>
          <textarea
            value={form.counsel_emails_raw}
            onChange={(e) => setForm((f) => ({ ...f, counsel_emails_raw: e.target.value }))}
            rows={4}
            placeholder={'legal@primecom.tech\ncounsel@lawfirm.com'}
            style={{ width: '100%', padding: '10px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{ padding: '10px 20px', background: '#47a141', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'documents',    label: 'Documents',      icon: FileText },
  { key: 'send',         label: 'Send Document',  icon: Send },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'settings',     label: 'Settings',       icon: Settings },
];

export default function Legal() {
  const [activeTab, setActiveTab] = useState('documents');
  const [settings, setSettings] = useState(null);
  const [demo, setDemo] = useState(false);
  const [unread, setUnread] = useState(0);

  async function loadSettings() {
    try {
      const s = await api.getLegalSettings();
      setSettings(s);
    } catch {}
  }

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    async function loadUnread() {
      try {
        if (demo) {
          setUnread(DEMO_NOTIFICATIONS.filter((n) => !n.is_read).length);
        } else {
          const data = await api.getLegalNotifications();
          setUnread((data || []).filter((n) => !n.is_read).length);
        }
      } catch {}
    }
    loadUnread();
  }, [demo, activeTab]);

  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Legal</div>
          <div style={{ fontSize: 13, color: '#8892a4' }}>DocuSign document management and legal counsel notifications</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {demo && (
            <span style={{ padding: '4px 10px', background: '#3d2e0a', border: '1px solid #f59e0b40', borderRadius: 6, color: '#f59e0b', fontSize: 11, fontWeight: 700 }}>
              DEMO MODE
            </span>
          )}
          <button
            onClick={() => setDemo((d) => !d)}
            style={{
              padding: '7px 14px',
              background: demo ? '#22263a' : '#1a1d27',
              border: `1px solid ${demo ? '#f59e0b' : '#2e3347'}`,
              borderRadius: 7,
              color: demo ? '#f59e0b' : '#8892a4',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {demo ? 'Exit Demo' : 'Demo Mode'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #2e3347', paddingBottom: 0 }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = activeTab === key;
          const badge = key === 'notifications' && unread > 0;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #47a141' : '2px solid transparent',
                color: active ? '#47a141' : '#8892a4',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                position: 'relative',
                marginBottom: -1,
              }}
            >
              <Icon size={14} />
              {label}
              {badge && (
                <span style={{
                  minWidth: 16,
                  height: 16,
                  borderRadius: 999,
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                }}>
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: 24 }}>
        {activeTab === 'documents' && <DocumentsTab demo={demo} />}
        {activeTab === 'send' && <SendTab demo={demo} settings={settings} onDocSent={() => {}} />}
        {activeTab === 'notifications' && <NotificationsTab demo={demo} settings={demo ? DEMO_SETTINGS : settings} />}
        {activeTab === 'settings' && <SettingsTab demo={demo} onSettingsChange={loadSettings} />}
      </div>
    </div>
  );
}
