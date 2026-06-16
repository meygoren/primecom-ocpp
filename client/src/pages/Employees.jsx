import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Users2, Edit2, UserPlus, X, Trash2 } from 'lucide-react';
import { api } from '../lib/api';

const COLORS = {
  bg: '#0f1117', card: '#1a1d27', border: '#2e3347',
  text: '#f1f5f9', muted: '#8892a4', accent: '#47a141',
};

const ROLE_COLORS = {
  driver: '#a855f7', admin: '#47a141', engineer: '#3b82f6', other: '#6b7280'
};

function RoleBadge({ role }) {
  const color = ROLE_COLORS[role] || ROLE_COLORS.other;
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600,
      textTransform: 'capitalize'
    }}>{role}</span>
  );
}

function StatusBadge({ active }) {
  return (
    <span style={{
      background: active ? '#47a14122' : '#6b728022',
      color: active ? '#47a141' : '#6b7280',
      border: `1px solid ${active ? '#47a14144' : '#6b728044'}`,
      borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600
    }}>{active ? 'Active' : 'Inactive'}</span>
  );
}

const EMPTY_FORM = { first_name: '', last_name: '', email: '', phone: '', address: '', role: 'driver', cdl_url: '', notes: '' };

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountMsg, setAccountMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterRole !== 'all') params.role = filterRole;
      const data = await api.getEmployees(params);
      setEmployees(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e.message && (e.message.includes('does not exist') || e.message.includes('relation') || e.message.includes('undefined'))) {
        setError('migration_needed');
      } else {
        setError(e.message || 'Failed to load employees');
      }
    } finally {
      setLoading(false);
    }
  }, [search, filterRole]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await api.createEmployee(addForm);
      setShowAdd(false);
      setAddForm(EMPTY_FORM);
      load();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const updated = await api.updateEmployee(selected.id, editForm);
      setSelected(updated);
      setEditing(false);
      load();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (emp) => {
    if (!confirm(`Deactivate ${emp.first_name} ${emp.last_name}?`)) return;
    await api.deleteEmployee(emp.id);
    setSelected(null);
    load();
  };

  const handleCreateAccount = async () => {
    if (!selected?.email) { alert('Employee must have an email address.'); return; }
    setCreatingAccount(true);
    setAccountMsg('');
    try {
      const tempPass = `Primecom${Math.random().toString(36).slice(2, 10)}!`;
      const result = await api.adminCreateUser({ email: selected.email, password: tempPass, role: 'driver' });
      if (result.error) throw new Error(result.error);
      setAccountMsg(`Account created! Temp password: ${tempPass}`);
    } catch (e) {
      setAccountMsg('Error: ' + e.message);
    } finally {
      setCreatingAccount(false);
    }
  };

  const TABS = [
    { key: 'all', label: 'All' },
    { key: 'driver', label: 'Drivers' },
    { key: 'admin', label: 'Admin' },
    { key: 'engineer', label: 'Engineers' },
    { key: 'other', label: 'Other' },
  ];

  const inputStyle = {
    background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8,
    color: '#f1f5f9', padding: '8px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box'
  };

  const btnPrimary = {
    background: '#47a141', color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
  };

  return (
    <div style={{ padding: 32, background: COLORS.bg, minHeight: '100vh', color: COLORS.text, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Users2 size={28} color={COLORS.accent} />
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Employees</h1>
            <p style={{ margin: 0, color: COLORS.muted, fontSize: 14 }}>Manage your team members</p>
          </div>
        </div>
        <button style={btnPrimary} onClick={() => setShowAdd(true)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> Add Employee</span>
        </button>
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: COLORS.muted }} />
          <input
            placeholder="Search name, email, phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 36 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 4 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setFilterRole(t.key)} style={{
              background: filterRole === t.key ? COLORS.accent : 'transparent',
              color: filterRole === t.key ? '#fff' : COLORS.muted,
              border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div style={{ display: 'flex', gap: 20 }}>
        {/* Table */}
        <div style={{ flex: 1, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted }}>Loading...</div>}
          {error === 'migration_needed' && (
            <div style={{ padding: 40, textAlign: 'center', color: '#f59e0b' }}>
              <Users2 size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
              <p style={{ fontWeight: 600 }}>Database tables not found</p>
              <p style={{ color: COLORS.muted, fontSize: 14 }}>Run the SQL migration first. Open <code>supabase_migration_schedules.sql</code> and paste it into the Supabase SQL editor.</p>
            </div>
          )}
          {error && error !== 'migration_needed' && (
            <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>{error}</div>
          )}
          {!loading && !error && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  {['Name', 'Role', 'Email', 'Phone', 'Status'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: COLORS.muted }}>No employees found</td></tr>
                )}
                {employees.map(emp => (
                  <tr key={emp.id}
                    onClick={() => { setSelected(emp); setEditing(false); setAccountMsg(''); }}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      cursor: 'pointer',
                      background: selected?.id === emp.id ? '#22263a' : 'transparent',
                      transition: 'background 0.12s'
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{emp.first_name} {emp.last_name}</td>
                    <td style={{ padding: '12px 16px' }}><RoleBadge role={emp.role} /></td>
                    <td style={{ padding: '12px 16px', color: COLORS.muted, fontSize: 14 }}>{emp.email || '—'}</td>
                    <td style={{ padding: '12px 16px', color: COLORS.muted, fontSize: 14 }}>{emp.phone || '—'}</td>
                    <td style={{ padding: '12px 16px' }}><StatusBadge active={emp.active} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ width: 340, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.first_name} {selected.last_name}</div>
                <RoleBadge role={selected.role} />
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
            </div>

            {!editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  ['Email', selected.email],
                  ['Phone', selected.phone],
                  ['Address', selected.address],
                  ['CDL URL', selected.cdl_url ? <a href={selected.cdl_url} target="_blank" rel="noreferrer" style={{ color: COLORS.accent }}>View CDL</a> : null],
                  ['Notes', selected.notes],
                ].map(([label, val]) => val ? (
                  <div key={label}>
                    <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 14 }}>{val}</div>
                  </div>
                ) : null)}

                <StatusBadge active={selected.active} />

                {accountMsg && (
                  <div style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, padding: 12, fontSize: 13, color: accountMsg.startsWith('Error') ? '#ef4444' : '#47a141', wordBreak: 'break-all' }}>
                    {accountMsg}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <button onClick={() => { setEditing(true); setEditForm({ ...selected }); }} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13 }}>
                    <Edit2 size={14} /> Edit
                  </button>
                  <button onClick={handleCreateAccount} disabled={creatingAccount} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UserPlus size={14} /> {creatingAccount ? 'Creating...' : 'Create Account'}
                  </button>
                  {selected.active && (
                    <button onClick={() => handleDeactivate(selected)} style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Trash2 size={14} /> Deactivate
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['first_name', 'First Name'], ['last_name', 'Last Name'],
                  ['email', 'Email'], ['phone', 'Phone'],
                  ['address', 'Address'], ['cdl_url', 'CDL URL'], ['notes', 'Notes']
                ].map(([key, label]) => (
                  <div key={key}>
                    <label style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</label>
                    <input value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
                  </div>
                ))}
                <div>
                  <label style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Role</label>
                  <select value={editForm.role || 'driver'} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} style={{ ...inputStyle }}>
                    {['driver', 'admin', 'engineer', 'other'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleSaveEdit} disabled={saving} style={btnPrimary}>{saving ? 'Saving...' : 'Save'}</button>
                  <button onClick={() => setEditing(false)} style={{ background: '#22263a', color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 32, width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Add Employee</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>First Name *</label>
                  <input value={addForm.first_name} onChange={e => setAddForm(f => ({ ...f, first_name: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Last Name *</label>
                  <input value={addForm.last_name} onChange={e => setAddForm(f => ({ ...f, last_name: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              {[['email', 'Email'], ['phone', 'Phone'], ['address', 'Address'], ['cdl_url', 'CDL URL'], ['notes', 'Notes']].map(([key, label]) => (
                <div key={key}>
                  <label style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input value={addForm[key] || ''} onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Role</label>
                <select value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))} style={inputStyle}>
                  {['driver', 'admin', 'engineer', 'other'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handleAdd} disabled={saving || !addForm.first_name || !addForm.last_name} style={{ ...btnPrimary, flex: 1 }}>
                  {saving ? 'Saving...' : 'Add Employee'}
                </button>
                <button onClick={() => setShowAdd(false)} style={{ background: '#22263a', color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 18px', fontSize: 14, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
