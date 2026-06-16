import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ── Test data ─────────────────────────────────────────────────────────────────

const DEMO_EMPLOYEES = [
  { id: 'd1', first_name: 'Marcus', last_name: 'Thompson', email: 'marcus@tower-mobility.com', phone: '(408) 555-0101', address: '123 Main St, San Jose, CA', role: 'driver', active: true, notes: 'Class A CDL', cdl_url: '', _demo: true },
  { id: 'd2', first_name: 'Jasmine', last_name: 'Rivera', email: 'jasmine@tower-mobility.com', phone: '(408) 555-0102', address: '456 Oak Ave, San Jose, CA', role: 'driver', active: true, notes: '', cdl_url: '', _demo: true },
  { id: 'd3', first_name: 'Kevin', last_name: 'Park', email: 'kevin@primecom.tech', phone: '(408) 555-0201', address: '789 Elm St, San Jose, CA', role: 'admin', active: true, notes: 'Fleet Manager', cdl_url: '', _demo: true },
  { id: 'd4', first_name: 'Sarah', last_name: 'Okonkwo', email: 'sarah@primecom.tech', phone: '(408) 555-0202', address: '321 Pine Rd, San Jose, CA', role: 'admin', active: true, notes: 'Operations Director', cdl_url: '', _demo: true },
  { id: 'd5', first_name: 'Diego', last_name: 'Morales', email: 'diego@primecom.tech', phone: '(408) 555-0301', address: '654 Cedar Blvd, San Jose, CA', role: 'engineer', active: true, notes: 'EV Systems', cdl_url: '', _demo: true },
  { id: 'd6', first_name: 'Priya', last_name: 'Nair', email: 'priya@primecom.tech', phone: '(408) 555-0302', address: '987 Maple Dr, San Jose, CA', role: 'engineer', active: true, notes: 'Charging Infrastructure', cdl_url: '', _demo: true },
  { id: 'd7', first_name: 'Terrence', last_name: 'Washington', email: 'terrence@tower-mobility.com', phone: '(408) 555-0103', address: '111 Birch Ln, San Jose, CA', role: 'driver', active: true, notes: 'Night shift specialist', cdl_url: '', _demo: true },
  { id: 'd8', first_name: 'Alyssa', last_name: 'Chen', email: 'alyssa@tower-mobility.com', phone: '(408) 555-0104', address: '222 Walnut St, San Jose, CA', role: 'driver', active: false, notes: 'On leave', cdl_url: '', _demo: true },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLORS = { driver: '#a855f7', admin: '#47a141', engineer: '#3b82f6', other: '#6b7280' };
const ROLE_LABELS = { driver: 'Driver', admin: 'Admin', engineer: 'Engineer', other: 'Other' };

function RoleBadge({ role }) {
  const color = ROLE_COLORS[role] || ROLE_COLORS.other;
  const label = ROLE_LABELS[role] || role;
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
      {label}
    </span>
  );
}

function StatusDot({ active }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#47a141' : '#6b7280', display: 'inline-block' }} />
      <span style={{ fontSize: 12, color: active ? '#47a141' : '#6b7280' }}>{active ? 'Active' : 'Inactive'}</span>
    </span>
  );
}

// ── EmployeeForm ──────────────────────────────────────────────────────────────

function EmployeeForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    first_name: initial?.first_name || '',
    last_name: initial?.last_name || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    address: initial?.address || '',
    role: initial?.role || 'driver',
    cdl_url: initial?.cdl_url || '',
    notes: initial?.notes || '',
    active: initial?.active !== false,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const inp = { background: '#0f1117', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 11px', color: '#f1f5f9', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>First Name *</label>
          <input style={inp} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} placeholder="Marcus" />
        </div>
        <div>
          <label style={lbl}>Last Name *</label>
          <input style={inp} value={form.last_name} onChange={(e) => set('last_name', e.target.value)} placeholder="Thompson" />
        </div>
        <div>
          <label style={lbl}>Email</label>
          <input style={inp} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="driver@company.com" type="email" />
        </div>
        <div>
          <label style={lbl}>Phone</label>
          <input style={inp} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(408) 555-0100" />
        </div>
        <div>
          <label style={lbl}>Role</label>
          <select style={{ ...inp, cursor: 'pointer' }} value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="driver">Driver</option>
            <option value="admin">Admin</option>
            <option value="engineer">Engineer</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Status</label>
          <select style={{ ...inp, cursor: 'pointer' }} value={form.active ? 'true' : 'false'} onChange={(e) => set('active', e.target.value === 'true')}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>
      <div>
        <label style={lbl}>Address</label>
        <input style={inp} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="123 Main St, San Jose, CA" />
      </div>
      <div>
        <label style={lbl}>CDL / License URL</label>
        <input style={inp} value={form.cdl_url} onChange={(e) => set('cdl_url', e.target.value)} placeholder="https://... (paste link to uploaded document)" />
      </div>
      <div>
        <label style={lbl}>Notes</label>
        <input style={inp} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional notes" />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 18px', color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>
          Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={!form.first_name || !form.last_name || saving}
          style={{ background: !form.first_name || !form.last_name || saving ? '#22263a' : '#47a141', border: 'none', borderRadius: 7, padding: '8px 20px', color: !form.first_name || !form.last_name || saving ? '#8892a4' : '#fff', fontWeight: 700, fontSize: 13, cursor: !form.first_name || !form.last_name || saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── EmployeeDetail ────────────────────────────────────────────────────────────

function EmployeeDetail({ emp, isDemo, onUpdate, onClose, canEdit }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);

  async function handleSave(form) {
    if (isDemo) { setEditing(false); return; }
    setSaving(true);
    try {
      const updated = await api.updateEmployee(emp.id, form);
      setEditing(false);
      if (onUpdate) onUpdate(updated);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAccount() {
    if (isDemo) { alert('Demo mode — account creation disabled'); return; }
    if (!emp.email) { alert('Employee must have an email address to create an account.'); return; }
    if (!window.confirm(`Create a driver account for ${emp.first_name} ${emp.last_name} (${emp.email})?`)) return;

    setCreatingAccount(true);
    try {
      const tempPassword = `Primecom${Math.random().toString(36).slice(2, 8)}!`;
      await api.adminCreateUser({ email: emp.email, password: tempPassword, role: 'driver', first_name: emp.first_name, last_name: emp.last_name });
      alert(`Account created!\n\nEmail: ${emp.email}\nTemp Password: ${tempPassword}\n\nShare this password with the driver — they should change it on first login.`);
    } catch (err) {
      alert('Failed to create account: ' + err.message);
    } finally {
      setCreatingAccount(false);
    }
  }

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #47a14144', borderRadius: 12, padding: 20, marginTop: 2 }}>
      {editing ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>Edit Employee</div>
          <EmployeeForm initial={emp} onSave={handleSave} onCancel={() => setEditing(false)} saving={saving} />
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{emp.first_name} {emp.last_name}</div>
              <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                <RoleBadge role={emp.role} />
                <StatusDot active={emp.active} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {canEdit && !isDemo && (
                <>
                  <button onClick={() => setEditing(true)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '7px 14px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>Edit</button>
                  {emp.role === 'driver' && (
                    <button onClick={handleCreateAccount} disabled={creatingAccount} style={{ background: '#1a2e1a', border: '1px solid #47a14166', borderRadius: 7, padding: '7px 14px', color: '#47a141', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {creatingAccount ? 'Creating...' : 'Create Driver Account'}
                    </button>
                  )}
                </>
              )}
              <button onClick={onClose} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '7px 14px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>Close</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            <InfoCell label="Email" value={emp.email || '—'} />
            <InfoCell label="Phone" value={emp.phone || '—'} />
            <InfoCell label="Address" value={emp.address || '—'} />
            {emp.cdl_url && (
              <div style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>CDL / License</div>
                <a href={emp.cdl_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#3b82f6', wordBreak: 'break-all' }}>View Document</a>
              </div>
            )}
            {emp.notes && <InfoCell label="Notes" value={emp.notes} />}
          </div>
        </>
      )}
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#f1f5f9', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ROLE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'driver', label: 'Drivers' },
  { key: 'admin', label: 'Admin' },
  { key: 'engineer', label: 'Engineers' },
  { key: 'other', label: 'Other' },
];

export default function Employees() {
  const profile = useProfile();
  const canEdit = profile?.role === 'admin' || profile?.role === 'operator';

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [roleTab, setRoleTab] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [testMode, setTestMode] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getEmployees({ active: '' });
      setEmployees(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayEmployees = testMode ? DEMO_EMPLOYEES : employees;

  const filtered = useMemo(() => {
    let list = displayEmployees;
    if (roleTab !== 'all') list = list.filter((e) => e.role === roleTab);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        (e.phone || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [displayEmployees, roleTab, search]);

  async function handleAdd(form) {
    if (testMode) { setShowAdd(false); return; }
    setAddSaving(true);
    try {
      await api.createEmployee(form);
      setShowAdd(false);
      load();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setAddSaving(false);
    }
  }

  function handleUpdate(updated) {
    setEmployees((prev) => prev.map((e) => e.id === updated.id ? updated : e));
    setSelected(updated);
  }

  const roleCounts = useMemo(() => {
    const counts = { all: displayEmployees.length, driver: 0, admin: 0, engineer: 0, other: 0 };
    for (const e of displayEmployees) counts[e.role] = (counts[e.role] || 0) + 1;
    return counts;
  }, [displayEmployees]);

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Employees</h1>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Employee directory — search, view profiles, and manage accounts</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setTestMode((m) => !m); setSelected(null); }}
            style={{ background: testMode ? '#2a1f00' : '#22263a', border: `1px solid ${testMode ? '#f59e0b' : '#2e3347'}`, borderRadius: 7, padding: '7px 14px', color: testMode ? '#f59e0b' : '#8892a4', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: testMode ? '#f59e0b' : '#4b5563', display: 'inline-block' }} />
            {testMode ? 'Test Mode ON' : 'Test Mode'}
          </button>
          {canEdit && (
            <button onClick={() => setShowAdd(true)} style={{ background: '#47a141', border: 'none', borderRadius: 7, padding: '7px 16px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + Add Employee
            </button>
          )}
        </div>
      </div>

      {testMode && (
        <div style={{ background: '#2a1f00', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: '#f59e0b', color: '#000', fontWeight: 800, fontSize: 10, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', flexShrink: 0 }}>Test Mode</span>
          <span style={{ fontSize: 12, color: '#fbbf24' }}>Showing 8 demo employees. Click any row to view details.</span>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Employees', value: displayEmployees.length, color: '#f1f5f9' },
          { label: 'Drivers', value: roleCounts.driver, color: '#a855f7' },
          { label: 'Admin', value: roleCounts.admin, color: '#47a141' },
          { label: 'Engineers', value: roleCounts.engineer, color: '#3b82f6' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: '#1a1d27', border: '1px solid #47a14166', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', marginBottom: 16 }}>Add Employee</div>
          <EmployeeForm initial={null} onSave={handleAdd} onCancel={() => setShowAdd(false)} saving={addSaving} />
        </div>
      )}

      {/* Search + tabs */}
      <div style={{ marginBottom: 0 }}>
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, padding: '9px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #2e3347' }}>
          {ROLE_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRoleTab(key)}
              style={{ background: 'none', border: 'none', borderBottom: `2px solid ${roleTab === key ? '#47a141' : 'transparent'}`, padding: '10px 16px', color: roleTab === key ? '#47a141' : '#8892a4', fontSize: 13, fontWeight: roleTab === key ? 700 : 400, cursor: 'pointer', marginBottom: -1 }}
            >
              {label} <span style={{ color: '#4b5563', fontSize: 11 }}>({roleCounts[key] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {error && !testMode && (
        <div style={{ padding: '16px 0', color: '#ef4444', fontSize: 13 }}>
          {error.includes('does not exist') || error.includes('relation') ? (
            <div style={{ background: '#1a1d27', border: '1px solid #ef444444', borderRadius: 8, padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Database migration required</div>
              <div style={{ fontSize: 12, color: '#8892a4' }}>Run <code style={{ color: '#f59e0b' }}>supabase_migration_schedules.sql</code> in your Supabase SQL editor to create the employees table.</div>
            </div>
          ) : error}
        </div>
      )}

      {loading && !testMode ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#8892a4' }}>Loading employees...</div>
      ) : (
        <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '60px 40px', textAlign: 'center', color: '#8892a4' }}>
              <div style={{ fontSize: 15, marginBottom: 8 }}>No employees found</div>
              <div style={{ fontSize: 13 }}>{search ? 'Try a different search term.' : 'Add your first employee above.'}</div>
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2e3347' }}>
                    {['Name', 'Role', 'Email', 'Phone', 'Status'].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((emp) => (
                    <>
                      <tr
                        key={emp.id}
                        onClick={() => setSelected(selected?.id === emp.id ? null : emp)}
                        style={{ borderBottom: selected?.id === emp.id ? 'none' : '1px solid #2e334722', cursor: 'pointer', background: selected?.id === emp.id ? '#22263a' : 'transparent', transition: 'background 0.1s' }}
                        onMouseEnter={(e) => { if (selected?.id !== emp.id) e.currentTarget.style.background = '#22263a22'; }}
                        onMouseLeave={(e) => { if (selected?.id !== emp.id) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#f1f5f9' }}>{emp.first_name} {emp.last_name}</td>
                        <td style={{ padding: '12px 16px' }}><RoleBadge role={emp.role} /></td>
                        <td style={{ padding: '12px 16px', color: '#8892a4' }}>{emp.email || '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#8892a4' }}>{emp.phone || '—'}</td>
                        <td style={{ padding: '12px 16px' }}><StatusDot active={emp.active} /></td>
                      </tr>
                      {selected?.id === emp.id && (
                        <tr key={`${emp.id}-detail`} style={{ borderBottom: '1px solid #2e3347' }}>
                          <td colSpan={5} style={{ padding: '0 16px 16px' }}>
                            <EmployeeDetail
                              emp={selected}
                              isDemo={!!emp._demo}
                              canEdit={canEdit}
                              onUpdate={handleUpdate}
                              onClose={() => setSelected(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
