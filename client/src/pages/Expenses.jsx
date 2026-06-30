import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0f1117', card: '#1a1d27', panel: '#22263a', border: '#2e3347',
  text: '#f1f5f9', muted: '#8892a4',
  green: '#47a141', blue: '#3b82f6', amber: '#f59e0b', red: '#ef4444', purple: '#a855f7', gray: '#6b7280',
};

const CATEGORIES = [
  { value: 'fuel',        label: 'Fuel',                  color: C.amber },
  { value: 'maintenance', label: 'Maintenance',           color: C.blue },
  { value: 'supplies',    label: 'Supplies',              color: C.gray },
  { value: 'meals',       label: 'Meals & Entertainment', color: C.purple },
  { value: 'lodging',     label: 'Lodging',               color: C.gray },
  { value: 'equipment',   label: 'Equipment',             color: C.green },
  { value: 'other',       label: 'Other',                 color: C.gray },
];

const PAYMENT_METHODS = [
  { value: 'company_card',  label: 'Company Card' },
  { value: 'personal_card', label: 'Personal Card' },
  { value: 'cash',          label: 'Cash' },
  { value: 'check',         label: 'Check' },
];

const STATUS_META = {
  pending:  { label: 'Pending',  color: C.amber },
  approved: { label: 'Approved', color: C.green },
  denied:   { label: 'Denied',   color: C.red },
};

function catMeta(value) { return CATEGORIES.find((c) => c.value === value) || { label: value, color: C.gray }; }
function pmLabel(value) { return PAYMENT_METHODS.find((p) => p.value === value)?.label || (value || '—'); }
function money(n) { return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

const labelStyle = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.muted, marginBottom: 6 };
const inputStyle = { width: '100%', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box' };

function Badge({ color, label }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent || C.text }}>{value}</div>
    </div>
  );
}

// ── Add Expense form ──────────────────────────────────────────────────────────
function ExpenseForm({ requireReceiptOver, defaultName, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today, description: '', category: 'fuel', amount: '',
    payment_method: 'company_card', receipt_url: '', authorized_by: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.description.trim()) { setError('Description is required.'); return; }
    if (form.amount === '' || isNaN(Number(form.amount))) { setError('A valid amount is required.'); return; }
    if (requireReceiptOver != null && Number(form.amount) > Number(requireReceiptOver) && !form.receipt_url.trim()) {
      setError(`A receipt link is required for expenses over ${money(requireReceiptOver)}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createExpense({
        ...form,
        amount: Number(form.amount),
        submitter_name: defaultName || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-5" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Add Expense</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14, marginBottom: 14 }}>
        <div>
          <div style={labelStyle}>Date <span style={{ color: C.red }}>*</span></div>
          <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Amount ($) <span style={{ color: C.red }}>*</span></div>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setField('amount', e.target.value)} placeholder="0.00" style={inputStyle} />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Description <span style={{ color: C.red }}>*</span></div>
        <input value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="What was this for?" style={inputStyle} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14, marginBottom: 14 }}>
        <div>
          <div style={labelStyle}>Category <span style={{ color: C.red }}>*</span></div>
          <select value={form.category} onChange={(e) => setField('category', e.target.value)} style={inputStyle}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Payment Method</div>
          <select value={form.payment_method} onChange={(e) => setField('payment_method', e.target.value)} style={inputStyle}>
            {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Receipt URL</div>
        <input value={form.receipt_url} onChange={(e) => setField('receipt_url', e.target.value)} placeholder="https://…" style={inputStyle} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Upload your receipt to Google Drive or email it, then paste the link here.</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={labelStyle}>Authorized By</div>
        <input value={form.authorized_by} onChange={(e) => setField('authorized_by', e.target.value)} placeholder="Who approved this expense?" style={inputStyle} />
      </div>

      {error && <div style={{ padding: '10px 14px', background: '#ef444418', border: `1px solid #ef444444`, borderRadius: 8, color: C.red, fontSize: 12, marginBottom: 14 }}>{error}</div>}

      <button onClick={submit} disabled={saving}
        style={{ padding: '9px 24px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Submitting…' : 'Submit Expense'}
      </button>
    </div>
  );
}

// ── Review modal (admin approve/deny) ─────────────────────────────────────────
function ReviewModal({ expense, onClose, onDone }) {
  const [notes, setNotes] = useState(expense.reviewer_notes || '');
  const [saving, setSaving] = useState(false);

  async function review(status) {
    setSaving(true);
    try {
      await api.updateExpense(expense.id, { status, reviewer_notes: notes });
      onDone();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, width: '100%', maxWidth: 460 }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Review Expense</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>{expense.description}</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{money(expense.amount)} · {catMeta(expense.category).label} · {expense.submitter_name || '—'}</div>
          <div style={labelStyle}>Reviewer Notes</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes…"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => review('approved')} disabled={saving}
              style={{ flex: 1, padding: '9px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Approve</button>
            <button onClick={() => review('denied')} disabled={saving}
              style={{ flex: 1, padding: '9px', background: C.red, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Deny</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settings (admin) ──────────────────────────────────────────────────────────
function SettingsSection({ settings, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        accounting_emails_raw: (settings.accounting_emails || []).join('\n'),
        auto_notify_accounting: !!settings.auto_notify_accounting,
        require_receipt_over: settings.require_receipt_over ?? 25,
      });
    }
  }, [settings]);

  if (!form) return null;

  async function save() {
    setSaving(true);
    try {
      await api.saveExpenseSettings({
        accounting_emails: form.accounting_emails_raw.split(/[\n,]/).map((e) => e.trim()).filter(Boolean),
        auto_notify_accounting: form.auto_notify_accounting,
        require_receipt_over: Number(form.require_receipt_over),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginTop: 24 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', background: 'none', border: 'none', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Accounting Settings</span>
        <span style={{ color: C.muted, fontSize: 13 }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-5 md:px-6 md:pb-6">
          <div style={{ marginBottom: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <div style={labelStyle}>Accounting notification emails (one per line)</div>
            <textarea value={form.accounting_emails_raw} onChange={(e) => setForm({ ...form, accounting_emails_raw: e.target.value })} rows={3}
              placeholder="accounting@company.com" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Auto-notify accounting on new expense</span>
            <button onClick={() => setForm({ ...form, auto_notify_accounting: !form.auto_notify_accounting })}
              style={{ width: 40, height: 22, borderRadius: 999, border: 'none', background: form.auto_notify_accounting ? C.green : C.border, position: 'relative', cursor: 'pointer' }}>
              <span style={{ position: 'absolute', top: 2, left: form.auto_notify_accounting ? 19 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </button>
          </div>
          <div style={{ marginBottom: 16, maxWidth: 280 }}>
            <div style={labelStyle}>Require receipt for expenses over ($)</div>
            <input type="number" step="0.01" value={form.require_receipt_over} onChange={(e) => setForm({ ...form, require_receipt_over: e.target.value })} style={inputStyle} />
          </div>
          <button onClick={save} disabled={saving} style={{ padding: '9px 22px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Expenses() {
  const profile = useProfile();
  const role = profile?.role;
  const isAdmin = role === 'admin' || role === 'operator';
  const myName = profile?.full_name || profile?.email || '';

  const [expenses, setExpenses] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [testMode, setTestMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newPending, setNewPending] = useState(0);

  const load = useCallback(async () => {
    try {
      const [e, s, set] = await Promise.all([
        api.getExpenses({ limit: 200 }).catch(() => []),
        api.getExpenseStats().catch(() => null),
        api.getExpenseSettings().catch(() => null),
      ]);
      setExpenses(e);
      setStats(s);
      setSettings(set);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Notification banner for accounting/admins: new pending since last visit
  useEffect(() => {
    if (!isAdmin || !stats) return;
    const lastSeen = parseInt(localStorage.getItem('expenses_last_seen_pending') || '0', 10);
    const current = stats.pending_count || 0;
    if (current > lastSeen) setNewPending(current - lastSeen);
    localStorage.setItem('expenses_last_seen_pending', String(current));
  }, [isAdmin, stats]);

  async function del(id) {
    if (!confirm('Delete this expense?')) return;
    try { await api.deleteExpense(id); load(); } catch (err) { alert(err.message); }
  }

  // ── Test mode: 8 demo expenses ─────────────────────────────────────────────
  async function generateDemo() {
    setGenerating(true);
    const demos = [
      { date: 0,  description: 'Diesel refuel — DSL-001',        category: 'fuel',        amount: 12.50,  payment_method: 'company_card',  status: 'approved', name: 'Marcus T.' },
      { date: 2,  description: 'Tire rotation — EMV-002',         category: 'maintenance', amount: 145.00, payment_method: 'company_card',  status: 'pending',  name: 'Jasmine R.' },
      { date: 3,  description: 'Charging cable adapters',         category: 'supplies',    amount: 38.75,  payment_method: 'personal_card', status: 'approved', name: 'Diego M.' },
      { date: 5,  description: 'Team lunch — site delivery',      category: 'meals',       amount: 64.20,  payment_method: 'company_card',  status: 'pending',  name: 'Aaliyah W.' },
      { date: 7,  description: 'Overnight stay — Inglewood',      category: 'lodging',     amount: 189.00, payment_method: 'personal_card', status: 'approved', name: 'Kevin O.' },
      { date: 9,  description: 'Torque wrench set',               category: 'equipment',   amount: 212.40, payment_method: 'company_card',  status: 'denied',   name: 'Sofia L.' },
      { date: 11, description: 'Parking — downtown LA',           category: 'other',       amount: 18.00,  payment_method: 'cash',          status: 'pending',  name: 'Marcus T.' },
      { date: 14, description: 'DEF fluid — DSL-002',             category: 'fuel',        amount: 27.90,  payment_method: 'company_card',  status: 'approved', name: 'Diego M.' },
    ];
    try {
      for (const d of demos) {
        const dt = new Date();
        dt.setDate(dt.getDate() - d.date);
        const created = await api.createExpense({
          date: dt.toISOString().slice(0, 10),
          description: d.description,
          category: d.category,
          amount: d.amount,
          payment_method: d.payment_method,
          receipt_url: 'https://drive.google.com/file/demo-receipt',
          authorized_by: 'Ops Lead',
          submitter_name: d.name,
        });
        // Apply non-pending statuses (admin only can patch status)
        if (isAdmin && d.status !== 'pending') {
          await api.updateExpense(created.id, { status: d.status, reviewer_notes: 'Demo (Test Mode)' });
        }
      }
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function toggleTestMode() {
    const next = !testMode;
    setTestMode(next);
    if (next) generateDemo();
  }

  const requireReceiptOver = settings?.require_receipt_over ?? 25;

  return (
    <div className="px-4 py-5 md:px-9 md:py-8" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Expenses</h1>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Submit and track expense reports</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={toggleTestMode} disabled={generating}
            style={{ padding: '8px 16px', background: testMode ? '#a855f722' : C.panel, border: `1px solid ${testMode ? C.purple : C.border}`, borderRadius: 8, color: testMode ? C.purple : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {generating ? 'Generating…' : 'Test Mode'}
          </button>
          <button onClick={() => setShowForm((s) => !s)}
            style={{ padding: '8px 18px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + Add Expense
          </button>
        </div>
      </div>

      {/* New pending banner */}
      {isAdmin && newPending > 0 && (
        <div style={{ background: '#f59e0b14', border: `1px solid ${C.amber}44`, borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, color: C.amber, fontWeight: 600 }}>{newPending} new expense{newPending > 1 ? 's' : ''} pending review</span>
          <button onClick={() => setNewPending(0)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 14, marginBottom: 24 }}>
        <StatCard label="Pending Expenses" value={stats?.pending_count ?? '—'} accent={stats?.pending_count > 0 ? C.amber : C.green} />
        <StatCard label="Approved This Month" value={stats ? money(stats.approved_total_month) : '—'} accent={C.green} />
        <StatCard label="My Submissions (Month)" value={stats?.my_submissions_month ?? '—'} accent={C.blue} />
      </div>

      {/* Add form */}
      {showForm && (
        <ExpenseForm
          requireReceiptOver={requireReceiptOver}
          defaultName={myName}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}

      {/* Table */}
      {loading ? (
        <div style={{ color: C.muted, padding: 40 }}>Loading expenses…</div>
      ) : expenses.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: C.muted }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No expenses yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Click "+ Add Expense" to submit one, or enable Test Mode for demo data.</div>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', background: C.panel }}>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                  <th style={{ padding: '10px 12px' }}>Submitted By</th>
                  <th style={{ padding: '10px 12px' }}>Description</th>
                  <th style={{ padding: '10px 12px' }}>Category</th>
                  <th style={{ padding: '10px 12px' }}>Amount</th>
                  <th style={{ padding: '10px 12px' }}>Payment</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Receipt</th>
                  <th style={{ padding: '10px 12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((x) => {
                  const cm = catMeta(x.category);
                  const sm = STATUS_META[x.status] || STATUS_META.pending;
                  const isMine = x.submitter_email && profile?.email && x.submitter_email === profile.email;
                  return (
                    <tr key={x.id} style={{ borderTop: `1px solid ${C.border}`, color: C.text }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{x.date}</td>
                      <td style={{ padding: '10px 12px', color: C.muted }}>{x.submitter_name || '—'}</td>
                      <td style={{ padding: '10px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.description}</td>
                      <td style={{ padding: '10px 12px' }}><Badge color={cm.color} label={cm.label} /></td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{money(x.amount)}</td>
                      <td style={{ padding: '10px 12px', color: C.muted }}>{pmLabel(x.payment_method)}</td>
                      <td style={{ padding: '10px 12px' }}><Badge color={sm.color} label={sm.label} /></td>
                      <td style={{ padding: '10px 12px' }}>
                        {x.receipt_url ? <a href={x.receipt_url} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: 12 }}>View</a> : <span style={{ color: C.muted }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {isAdmin && x.status === 'pending' && (
                          <button onClick={() => setReviewing(x)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, color: C.green, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '6px 12px', marginRight: 6 }}>Review</button>
                        )}
                        {(isMine || isAdmin) && x.status === 'pending' && (
                          <button onClick={() => del(x.id)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 12, cursor: 'pointer', padding: '6px 4px' }}>Delete</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings (admin only) */}
      {isAdmin && <SettingsSection settings={settings} onSaved={load} />}

      {reviewing && (
        <ReviewModal expense={reviewing} onClose={() => setReviewing(null)} onDone={load} />
      )}
    </div>
  );
}
