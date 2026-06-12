import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/time';

const ROLE_COLORS = {
  admin:    { bg: '#1a3a1a', border: '#47a141', text: '#47a141' },
  operator: { bg: '#1a2a3a', border: '#3b82f6', text: '#3b82f6' },
  viewer:   { bg: '#2a2a1a', border: '#f59e0b', text: '#f59e0b' },
  driver:   { bg: '#2a1a2a', border: '#a855f7', text: '#a855f7' },
};

const ROLE_OPTIONS = [
  { value: 'admin',    label: 'Admin',    desc: 'Full access — all pages, commands, user management' },
  { value: 'operator', label: 'Operator', desc: 'All pages + commands, cannot manage user accounts' },
  { value: 'viewer',   label: 'Viewer',   desc: 'View-only access — no commands, no changes' },
  { value: 'driver',   label: 'Driver',   desc: 'Assigned charger + SOC notifications only' },
];

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.user;
  return (
    <span style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
      {role}
    </span>
  );
}

export default function Accounts() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected user for charger assignment panel
  const [selectedUser, setSelectedUser] = useState(null);
  const [allChargers, setAllChargers] = useState([]);
  const [assignedIds, setAssignedIds] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignSaved, setAssignSaved] = useState(false);

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState(null);

  async function loadUsers() {
    try {
      const data = await api.adminGetUsers();
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function selectUser(user) {
    setSelectedUser(user);
    setAssignSaved(false);
    setAssignLoading(true);
    try {
      const [chargers, assigned] = await Promise.all([
        api.getChargers(),
        api.adminGetUserChargers(user.id),
      ]);
      setAllChargers(chargers);
      setAssignedIds(assigned);
    } catch (err) {
      console.error(err);
    } finally {
      setAssignLoading(false);
    }
  }

  function toggleCharger(cid) {
    setAssignedIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
    );
    setAssignSaved(false);
  }

  async function saveAssignments() {
    setAssignSaving(true);
    try {
      await api.adminSetUserChargers(selectedUser.id, assignedIds);
      setAssignSaved(true);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setAssignSaving(false);
    }
  }

  async function createUser(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await api.adminCreateUser({ email: newEmail, password: newPassword, full_name: newName, role: newRole });
      setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('viewer');
      setShowCreate(false);
      loadUsers();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function changeRole(user, newRole) {
    try {
      await api.adminUpdateUser(user.id, { role: newRole });
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u));
      if (selectedUser?.id === user.id) setSelectedUser((prev) => ({ ...prev, role: newRole }));
    } catch (err) {
      alert('Failed to update role: ' + err.message);
    }
  }

  async function deleteUser(id) {
    try {
      await api.adminDeleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (selectedUser?.id === id) setSelectedUser(null);
      setDeletingId(null);
    } catch (err) {
      alert('Failed to delete: ' + err.message);
      setDeletingId(null);
    }
  }

  const inputStyle = {
    width: '100%',
    background: '#22263a',
    border: '1px solid #2e3347',
    borderRadius: 7,
    padding: '9px 12px',
    color: '#f1f5f9',
    fontSize: 13,
    outline: 'none',
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1280 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Accounts</h1>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Manage users and charger access</div>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(null); }}
          style={{ background: '#47a141', border: 'none', borderRadius: 8, padding: '9px 18px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          + New User
        </button>
      </div>

      {/* Create user form */}
      {showCreate && (
        <div style={{ background: '#1a1d27', border: '1px solid #47a141', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>Create New User</div>
          <form onSubmit={createUser}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>Email</label>
                <input style={inputStyle} type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>Password</label>
                <input style={inputStyle} type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>Full Name (optional)</label>
                <input style={inputStyle} type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="John Smith" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                  ))}
                </select>
              </div>
            </div>
            {createError && (
              <div style={{ background: '#3f1515', border: '1px solid #ef4444', borderRadius: 7, padding: '10px 14px', color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
                {createError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={creating} style={{ background: creating ? '#22263a' : '#47a141', border: 'none', borderRadius: 7, padding: '9px 20px', color: creating ? '#8892a4' : '#fff', fontWeight: 700, fontSize: 13, cursor: creating ? 'not-allowed' : 'pointer' }}>
                {creating ? 'Creating...' : 'Create User'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '9px 20px', color: '#8892a4', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 340px' : '1fr', gap: 20, alignItems: 'start' }}>
        {/* User table */}
        <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8892a4' }}>Loading...</div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>{error}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2e3347' }}>
                  {['Name', 'Email', 'Role', 'Created', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#8892a4' }}>No users yet</td></tr>
                ) : users.map((u) => (
                  <tr
                    key={u.id}
                    style={{ borderBottom: '1px solid #2e3347', background: selectedUser?.id === u.id ? '#22263a' : 'transparent', cursor: 'pointer' }}
                    onClick={() => selectUser(u)}
                  >
                    <td style={{ padding: '12px 16px', color: '#f1f5f9', fontWeight: 500 }}>{u.full_name || '—'}</td>
                    <td style={{ padding: '12px 16px', color: '#8892a4' }}>{u.email}</td>
                    <td style={{ padding: '12px 16px' }}><RoleBadge role={u.role} /></td>
                    <td style={{ padding: '12px 16px', color: '#8892a4' }}>{formatDateTime(u.created_at)}</td>
                    <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 6, padding: '5px 8px', color: '#8892a4', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        {deletingId === u.id ? (
                          <>
                            <button onClick={() => deleteUser(u.id)} style={{ background: '#3f1515', border: '1px solid #ef4444', borderRadius: 6, padding: '5px 10px', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
                            <button onClick={() => setDeletingId(null)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 6, padding: '5px 10px', color: '#8892a4', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setDeletingId(u.id)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 6, padding: '5px 10px', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Charger assignment panel */}
        {selectedUser && (
          <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #2e3347' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Charger Access</div>
              <div style={{ fontSize: 12, color: '#8892a4', marginTop: 2 }}>{selectedUser.email}</div>
            </div>

            {assignLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#8892a4', fontSize: 13 }}>Loading chargers...</div>
            ) : allChargers.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#8892a4', fontSize: 13 }}>No chargers connected yet</div>
            ) : (
              <>
                <div style={{ padding: '12px 20px', maxHeight: 360, overflowY: 'auto' }}>
                  {allChargers.map((c) => {
                    const checked = assignedIds.includes(c.charger_id);
                    return (
                      <label
                        key={c.charger_id}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #2e3347', cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCharger(c.charger_id)}
                          style={{ width: 15, height: 15, accentColor: '#47a141', cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{c.charger_id}</div>
                          {c.location_label && <div style={{ fontSize: 11, color: '#8892a4' }}>{c.location_label}</div>}
                        </div>
                        <span style={{
                          marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                          background: c.status === 'online' ? '#1a3a1a' : c.status === 'charging' ? '#1a2540' : c.status === 'faulted' ? '#3f1515' : '#22263a',
                          color: c.status === 'online' ? '#47a141' : c.status === 'charging' ? '#3b82f6' : c.status === 'faulted' ? '#ef4444' : '#6b7280',
                          textTransform: 'capitalize',
                        }}>
                          {c.status}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ padding: '14px 20px', borderTop: '1px solid #2e3347', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={saveAssignments}
                    disabled={assignSaving}
                    style={{ background: assignSaving ? '#22263a' : '#47a141', border: 'none', borderRadius: 7, padding: '9px 18px', color: assignSaving ? '#8892a4' : '#fff', fontWeight: 700, fontSize: 13, cursor: assignSaving ? 'not-allowed' : 'pointer' }}
                  >
                    {assignSaving ? 'Saving...' : 'Save Access'}
                  </button>
                  {assignSaved && <span style={{ fontSize: 12, color: '#47a141', fontWeight: 600 }}>Saved</span>}
                  <button onClick={() => setSelectedUser(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#8892a4', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Close</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
