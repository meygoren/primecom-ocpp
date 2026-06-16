import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

const FLEET_TYPES = ['electric', 'diesel', 'mixed', 'other'];
const STATUSES = ['active', 'inactive', 'prospect'];

const STATUS_STYLE = {
  active:   { color: '#47a141', bg: '#47a14120' },
  inactive: { color: '#6b7280', bg: '#6b728020' },
  prospect: { color: '#f59e0b', bg: '#f59e0b20' },
};

const DEMO_CUSTOMERS = [
  {
    id: 'demo-1',
    name: 'Tower Mobility',
    contact_name: 'Alex Torres',
    email: 'alex@towermobility.com',
    phone: '(213) 555-0100',
    address: '320 E Harry Bridges Blvd, Wilmington, CA 90744',
    fleet_type: 'electric',
    vehicle_count: 6,
    status: 'active',
    notes: 'Primary customer. 4 International EMVs + 2 diesel backup trucks. Round-trip Wilmington ↔ Inglewood daily.',
    created_at: '2025-01-15T00:00:00Z',
  },
  {
    id: 'demo-2',
    name: 'Bali Express',
    contact_name: 'Dewi Santoso',
    email: 'dewi@baliexpress.com',
    phone: '(310) 555-0200',
    address: 'Los Angeles, CA',
    fleet_type: 'mixed',
    vehicle_count: 0,
    status: 'prospect',
    notes: 'In discussion. Mixed fleet of delivery vehicles.',
    created_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'demo-3',
    name: 'Avis SD',
    contact_name: 'Maria Gutierrez',
    email: 'mgutierrez@avissd.com',
    phone: '(619) 555-0300',
    address: 'San Diego, CA',
    fleet_type: 'electric',
    vehicle_count: 0,
    status: 'prospect',
    notes: 'San Diego location. EV rental fleet expansion planned for Q3 2026.',
    created_at: '2026-04-10T00:00:00Z',
  },
  {
    id: 'demo-4',
    name: 'Avis SF',
    contact_name: 'James Chen',
    email: 'jchen@avissf.com',
    phone: '(415) 555-0400',
    address: 'San Francisco, CA',
    fleet_type: 'electric',
    vehicle_count: 0,
    status: 'prospect',
    notes: 'San Francisco location. Interest in DC fast charger installation.',
    created_at: '2026-04-10T00:00:00Z',
  },
];

const BLANK_FORM = {
  name: '', contact_name: '', email: '', phone: '',
  address: '', fleet_type: 'electric', vehicle_count: '',
  status: 'active', notes: '',
};

export default function Customers() {
  const profile = useProfile();
  const role = profile?.role;
  const canEdit = role === 'admin' || role === 'operator';

  const [testMode,   setTestMode]   = useState(false);
  const [customers,  setCustomers]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [editId,     setEditId]     = useState(null);
  const [form,       setForm]       = useState(BLANK_FORM);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');

  useEffect(() => {
    if (testMode) {
      setCustomers(DEMO_CUSTOMERS);
      setLoading(false);
      return;
    }
    load();
  }, [testMode]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getCustomers();
      setCustomers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditId(null);
    setForm(BLANK_FORM);
    setShowForm(true);
    setSelected(null);
  }

  function openEdit(c) {
    setEditId(c.id);
    setForm({
      name: c.name || '',
      contact_name: c.contact_name || '',
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      fleet_type: c.fleet_type || 'electric',
      vehicle_count: c.vehicle_count ?? '',
      status: c.status || 'active',
      notes: c.notes || '',
    });
    setShowForm(true);
    setSelected(null);
  }

  async function save() {
    if (!form.name.trim()) return setError('Customer name is required.');
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, vehicle_count: form.vehicle_count !== '' ? parseInt(form.vehicle_count) : 0 };
      if (testMode) {
        if (editId) {
          setCustomers((prev) => prev.map((c) => c.id === editId ? { ...c, ...payload } : c));
        } else {
          setCustomers((prev) => [{ ...payload, id: 'demo-' + Date.now(), created_at: new Date().toISOString() }, ...prev]);
        }
      } else {
        if (editId) {
          const updated = await api.updateCustomer(editId, payload);
          setCustomers((prev) => prev.map((c) => c.id === editId ? updated : c));
        } else {
          const created = await api.createCustomer(payload);
          setCustomers((prev) => [...prev, created]);
        }
      }
      setShowForm(false);
      setEditId(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer(id) {
    if (!window.confirm('Delete this customer account?')) return;
    try {
      if (!testMode) await api.deleteCustomer(id);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e) {
      setError(e.message);
    }
  }

  const filtered = customers.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const activeCount   = customers.filter((c) => c.status === 'active').length;
  const prospectCount = customers.filter((c) => c.status === 'prospect').length;
  const totalVehicles = customers.reduce((s, c) => s + (c.vehicle_count || 0), 0);

  return (
    <div style={{ padding: 32, background: '#0f1117', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Customer Accounts</h1>
          <p style={{ fontSize: 13, color: '#8892a4', margin: '4px 0 0' }}>Fleet customers and contact management</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <div onClick={() => setTestMode((t) => !t)} style={{ width: 36, height: 20, borderRadius: 10, background: testMode ? '#47a141' : '#2e3347', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: testMode ? 19 : 3, transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: 12, color: testMode ? '#47a141' : '#8892a4', fontWeight: 600 }}>Test Mode</span>
          </label>
          {canEdit && (
            <button onClick={openAdd} style={{ padding: '8px 18px', background: '#47a141', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              + Add Customer
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background: '#2a1215', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 16px', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>{error}</div>}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Active Customers', value: activeCount,   color: '#47a141' },
          { label: 'Prospects',        value: prospectCount, color: '#f59e0b' },
          { label: 'Total Vehicles',   value: totalVehicles, color: '#3b82f6' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add/Edit form */}
      {showForm && canEdit && (
        <div style={{ background: '#1a1d27', border: '1px solid #47a141', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 18 }}>{editId ? 'Edit Customer' : 'New Customer'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            {[
              { label: 'Company Name *', key: 'name', placeholder: 'Tower Mobility' },
              { label: 'Contact Name',   key: 'contact_name', placeholder: 'First Last' },
              { label: 'Email',          key: 'email', type: 'email', placeholder: 'contact@example.com' },
              { label: 'Phone',          key: 'phone', placeholder: '(310) 555-0100' },
              { label: 'Vehicle Count',  key: 'vehicle_count', type: 'number', placeholder: '0' },
            ].map((f) => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>{f.label}</label>
                <input
                  type={f.type || 'text'}
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px' }}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Address</label>
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Street, City, State ZIP"
              style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Fleet Type</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {FLEET_TYPES.map((t) => (
                <button key={t} onClick={() => setForm((f) => ({ ...f, fleet_type: t }))}
                  style={{ padding: '5px 14px', borderRadius: 7, border: `1px solid ${form.fleet_type === t ? '#47a141' : '#2e3347'}`, background: form.fleet_type === t ? '#47a14120' : 'transparent', color: form.fleet_type === t ? '#47a141' : '#8892a4', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3} placeholder="Internal notes about this customer"
              style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '9px 22px', background: '#47a141', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Customer'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              style={{ padding: '9px 16px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company or contact name..."
          style={{ width: 320, background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '9px 14px' }} />
      </div>

      {loading ? (
        <div style={{ color: '#8892a4', fontSize: 14, textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filtered.map((c) => {
            const st = STATUS_STYLE[c.status] || STATUS_STYLE.inactive;
            return (
              <div
                key={c.id}
                onClick={() => setSelected(selected?.id === c.id ? null : c)}
                style={{
                  background: '#1a1d27',
                  border: `1px solid ${selected?.id === c.id ? '#47a141' : '#2e3347'}`,
                  borderRadius: 12,
                  padding: 20,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{c.name}</div>
                    {c.contact_name && <div style={{ fontSize: 12, color: '#8892a4', marginTop: 2 }}>{c.contact_name}</div>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, padding: '3px 9px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {c.status}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                  {c.email && <div style={{ fontSize: 12, color: '#8892a4' }}>{c.email}</div>}
                  {c.phone && <div style={{ fontSize: 12, color: '#8892a4' }}>{c.phone}</div>}
                </div>

                {c.address && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>{c.address}</div>}

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', background: '#1a2a3a', padding: '3px 8px', borderRadius: 5, textTransform: 'capitalize' }}>{c.fleet_type} fleet</span>
                  {c.vehicle_count > 0 && <span style={{ fontSize: 11, color: '#8892a4' }}>{c.vehicle_count} vehicles</span>}
                </div>

                {selected?.id === c.id && (
                  <div onClick={(e) => e.stopPropagation()}>
                    {c.notes && (
                      <div style={{ marginTop: 14, padding: 12, background: '#0f1117', borderRadius: 8, fontSize: 12, color: '#8892a4', lineHeight: 1.5 }}>
                        {c.notes}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      {canEdit && (
                        <button onClick={() => openEdit(c)}
                          style={{ padding: '6px 16px', background: '#47a141', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          Edit
                        </button>
                      )}
                      {role === 'admin' && (
                        <button onClick={() => deleteCustomer(c.id)}
                          style={{ padding: '6px 14px', background: 'none', border: '1px solid #ef4444', borderRadius: 7, color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#8892a4', fontSize: 13 }}>
              {search ? 'No customers match your search.' : 'No customers yet. Enable Test Mode or click "+ Add Customer".'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
