import { useState, useEffect } from 'react';
import { api } from '../lib/api';

const VEHICLE_STATUS = {
  active:     { label: 'Active',      color: '#47a141' },
  in_service: { label: 'In Service',  color: '#f59e0b' },
  retired:    { label: 'Retired',     color: '#6b7280' },
};

const MAINTENANCE_TYPES = [
  'Oil Change', 'Tire Rotation', 'Brake Service', 'Battery Check',
  'Inspection', 'Repair', 'Fluid Top-Off', 'Filter Replacement', 'Other',
];

const DEMO_VEHICLES = [
  { id: 'demo-1', name: 'EMV-001', vehicle_type: 'electric', year: 2023, capacity_kwh: 200, current_soc_pct: 78, last_service_date: '2026-05-10', odometer_miles: 12400, status: 'active', notes: 'Primary Wilmington unit' },
  { id: 'demo-2', name: 'EMV-002', vehicle_type: 'electric', year: 2023, capacity_kwh: 200, current_soc_pct: 45, last_service_date: '2026-04-22', odometer_miles: 14800, status: 'active', notes: '' },
  { id: 'demo-3', name: 'EMV-003', vehicle_type: 'electric', year: 2022, capacity_kwh: 200, current_soc_pct: 92, last_service_date: '2026-05-30', odometer_miles: 22300, status: 'active', notes: '' },
  { id: 'demo-4', name: 'EMV-004', vehicle_type: 'electric', year: 2022, capacity_kwh: 200, current_soc_pct: 0,  last_service_date: '2026-03-15', odometer_miles: 31200, status: 'in_service', notes: 'Battery module replacement' },
  { id: 'demo-5', name: 'DSL-001', vehicle_type: 'diesel',   year: 2021, capacity_kwh: null, current_soc_pct: null, last_service_date: '2026-05-01', odometer_miles: 87400, status: 'active', notes: 'Backup unit' },
  { id: 'demo-6', name: 'DSL-002', vehicle_type: 'diesel',   year: 2020, capacity_kwh: null, current_soc_pct: null, last_service_date: '2026-02-18', odometer_miles: 113200, status: 'active', notes: '' },
];

const DEMO_MAINTENANCE = [
  { id: 'dm-1', vehicle_id: 'demo-1', date: '2026-05-10', type: 'Inspection',   description: 'Annual DOT inspection — passed',        cost: 0,    performed_by: 'Primecom Tech',  next_service_date: '2027-05-10', fleet_vehicles: { name: 'EMV-001', vehicle_type: 'electric' } },
  { id: 'dm-2', vehicle_id: 'demo-4', date: '2026-03-15', type: 'Repair',       description: 'Battery module fault — replacement ordered', cost: 8400, performed_by: 'International', next_service_date: null,         fleet_vehicles: { name: 'EMV-004', vehicle_type: 'electric' } },
  { id: 'dm-3', vehicle_id: 'demo-5', date: '2026-05-01', type: 'Oil Change',   description: '15W-40 diesel, 10 qt',                  cost: 180,  performed_by: 'Jiffy Lube',     next_service_date: '2026-08-01', fleet_vehicles: { name: 'DSL-001', vehicle_type: 'diesel' } },
  { id: 'dm-4', vehicle_id: 'demo-2', date: '2026-04-22', type: 'Tire Rotation',description: 'All 6 drive tires rotated',              cost: 120,  performed_by: 'Primecom Tech',  next_service_date: '2026-10-22', fleet_vehicles: { name: 'EMV-002', vehicle_type: 'electric' } },
  { id: 'dm-5', vehicle_id: 'demo-6', date: '2026-02-18', type: 'Brake Service',description: 'Rear brake drums resurfaced',            cost: 640,  performed_by: 'Speedway Diesel',next_service_date: '2027-02-18', fleet_vehicles: { name: 'DSL-002', vehicle_type: 'diesel' } },
];

function SocBar({ pct }) {
  if (pct == null) return <span style={{ color: '#6b7280', fontSize: 12 }}>N/A</span>;
  const color = pct >= 70 ? '#47a141' : pct >= 30 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#2e3347', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, width: 32 }}>{pct}%</span>
    </div>
  );
}

export default function FleetAssets() {
  const [testMode,     setTestMode]     = useState(false);
  const [vehicles,     setVehicles]     = useState([]);
  const [maintenance,  setMaintenance]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedVeh,  setSelectedVeh]  = useState(null);
  const [tab,          setTab]          = useState('vehicles'); // vehicles | maintenance
  const [editVeh,      setEditVeh]      = useState(null);
  const [showAddMaint, setShowAddMaint] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  const [maintForm, setMaintForm] = useState({
    vehicle_id: '', date: new Date().toISOString().slice(0, 10),
    type: 'Inspection', description: '', cost: '', performed_by: '', next_service_date: '', notes: '',
  });

  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    if (testMode) {
      setVehicles(DEMO_VEHICLES);
      setMaintenance(DEMO_MAINTENANCE);
      setLoading(false);
      return;
    }
    load();
  }, [testMode]);

  async function load() {
    setLoading(true);
    try {
      const [v, m] = await Promise.all([api.getFleetVehicles(), api.getMaintenanceLogs()]);
      setVehicles(v);
      setMaintenance(m);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function startEditVeh(v) {
    setEditVeh(v.id);
    setEditForm({
      current_soc_pct: v.current_soc_pct ?? '',
      last_service_date: v.last_service_date || '',
      odometer_miles: v.odometer_miles ?? '',
      status: v.status || 'active',
      notes: v.notes || '',
    });
  }

  async function saveVeh(id) {
    setSaving(true);
    try {
      if (testMode) {
        setVehicles((prev) => prev.map((v) => v.id === id ? { ...v, ...editForm } : v));
      } else {
        const updated = await api.updateFleetVehicle(id, editForm);
        setVehicles((prev) => prev.map((v) => v.id === id ? updated : v));
      }
      setEditVeh(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function addMaintenance() {
    setSaving(true);
    try {
      const payload = {
        ...maintForm,
        cost: maintForm.cost ? parseFloat(maintForm.cost) : null,
        next_service_date: maintForm.next_service_date || null,
      };
      if (testMode) {
        const veh = vehicles.find((v) => v.id === payload.vehicle_id);
        setMaintenance((prev) => [{ ...payload, id: 'demo-' + Date.now(), fleet_vehicles: { name: veh?.name, vehicle_type: veh?.vehicle_type } }, ...prev]);
      } else {
        const rec = await api.createMaintenanceLog(payload);
        setMaintenance((prev) => [rec, ...prev]);
      }
      setShowAddMaint(false);
      setMaintForm({ vehicle_id: '', date: new Date().toISOString().slice(0, 10), type: 'Inspection', description: '', cost: '', performed_by: '', next_service_date: '', notes: '' });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteMaint(id) {
    if (!window.confirm('Delete this maintenance log entry?')) return;
    try {
      if (!testMode) await api.deleteMaintenanceLog(id);
      setMaintenance((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  const filtered = selectedVeh ? maintenance.filter((m) => m.vehicle_id === selectedVeh) : maintenance;

  const activeCount   = vehicles.filter((v) => v.status === 'active').length;
  const inServiceCount = vehicles.filter((v) => v.status === 'in_service').length;
  const electricCount = vehicles.filter((v) => v.vehicle_type === 'electric').length;
  const dieselCount   = vehicles.filter((v) => v.vehicle_type === 'diesel').length;

  return (
    <div style={{ padding: 32, background: '#0f1117', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Fleet & Asset Tracker</h1>
          <p style={{ fontSize: 13, color: '#8892a4', margin: '4px 0 0' }}>Vehicle profiles, SoC, and maintenance history</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <div
              onClick={() => setTestMode((t) => !t)}
              style={{
                width: 36, height: 20, borderRadius: 10,
                background: testMode ? '#47a141' : '#2e3347',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3, left: testMode ? 19 : 3, transition: 'left 0.2s',
              }} />
            </div>
            <span style={{ fontSize: 12, color: testMode ? '#47a141' : '#8892a4', fontWeight: 600 }}>Test Mode</span>
          </label>
        </div>
      </div>

      {error && <div style={{ background: '#2a1215', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 16px', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>{error}</div>}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Units',  value: vehicles.length, color: '#f1f5f9' },
          { label: 'Active',       value: activeCount,     color: '#47a141' },
          { label: 'In Service',   value: inServiceCount,  color: '#f59e0b' },
          { label: 'Electric / Diesel', value: `${electricCount} / ${dieselCount}`, color: '#3b82f6' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {['vehicles', 'maintenance'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: tab === t ? '#47a141' : '#22263a',
              color: tab === t ? '#fff' : '#8892a4',
            }}
          >
            {t === 'vehicles' ? 'Fleet Vehicles' : 'Maintenance Log'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#8892a4', fontSize: 14, textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : tab === 'vehicles' ? (
        /* --- Vehicles table --- */
        <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2e3347' }}>
                {['Unit', 'Type', 'Year', 'Status', 'Battery SoC', 'Odometer', 'Last Service', 'Notes', ''].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 11, color: '#8892a4', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const st = VEHICLE_STATUS[v.status] || VEHICLE_STATUS.active;
                const isEditing = editVeh === v.id;
                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #2e3347', background: isEditing ? '#22263a' : 'transparent' }}>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{v.name}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
                        background: v.vehicle_type === 'electric' ? '#1a3a4a' : '#2a2010',
                        color: v.vehicle_type === 'electric' ? '#3b82f6' : '#f59e0b',
                      }}>
                        {v.vehicle_type === 'electric' ? 'Electric' : 'Diesel'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#8892a4' }}>{v.year || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      {isEditing ? (
                        <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                          style={{ background: '#0f1117', border: '1px solid #2e3347', borderRadius: 6, color: '#f1f5f9', fontSize: 12, padding: '4px 8px' }}>
                          {Object.entries(VEHICLE_STATUS).map(([k, vs]) => <option key={k} value={k}>{vs.label}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: `${st.color}20`, padding: '3px 8px', borderRadius: 5 }}>{st.label}</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', minWidth: 140 }}>
                      {isEditing ? (
                        <input type="number" min="0" max="100" value={editForm.current_soc_pct}
                          onChange={(e) => setEditForm((f) => ({ ...f, current_soc_pct: e.target.value }))}
                          placeholder="SoC %"
                          style={{ background: '#0f1117', border: '1px solid #2e3347', borderRadius: 6, color: '#f1f5f9', fontSize: 12, padding: '4px 8px', width: 70 }} />
                      ) : (
                        <SocBar pct={v.current_soc_pct} />
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#8892a4' }}>
                      {isEditing ? (
                        <input type="number" value={editForm.odometer_miles}
                          onChange={(e) => setEditForm((f) => ({ ...f, odometer_miles: e.target.value }))}
                          placeholder="Miles"
                          style={{ background: '#0f1117', border: '1px solid #2e3347', borderRadius: 6, color: '#f1f5f9', fontSize: 12, padding: '4px 8px', width: 90 }} />
                      ) : (
                        v.odometer_miles != null ? `${v.odometer_miles.toLocaleString()} mi` : '—'
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#8892a4' }}>
                      {isEditing ? (
                        <input type="date" value={editForm.last_service_date}
                          onChange={(e) => setEditForm((f) => ({ ...f, last_service_date: e.target.value }))}
                          style={{ background: '#0f1117', border: '1px solid #2e3347', borderRadius: 6, color: '#f1f5f9', fontSize: 12, padding: '4px 8px' }} />
                      ) : (
                        v.last_service_date || '—'
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#8892a4', maxWidth: 160 }}>
                      {isEditing ? (
                        <input value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                          style={{ background: '#0f1117', border: '1px solid #2e3347', borderRadius: 6, color: '#f1f5f9', fontSize: 12, padding: '4px 8px', width: '100%' }} />
                      ) : (
                        v.notes || '—'
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveVeh(v.id)} disabled={saving}
                            style={{ padding: '5px 12px', background: '#47a141', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Save
                          </button>
                          <button onClick={() => setEditVeh(null)}
                            style={{ padding: '5px 10px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 6, color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEditVeh(v)}
                          style={{ padding: '5px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 6, color: '#8892a4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {vehicles.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#8892a4', fontSize: 13 }}>No vehicles — enable Test Mode or run the SQL migration</div>
          )}
        </div>
      ) : (
        /* --- Maintenance Log --- */
        <div>
          {/* Filter + Add */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#8892a4' }}>Filter by unit:</span>
              <select value={selectedVeh || ''} onChange={(e) => setSelectedVeh(e.target.value || null)}
                style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '6px 12px' }}>
                <option value="">All vehicles</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <button onClick={() => setShowAddMaint(true)}
              style={{ padding: '8px 18px', background: '#47a141', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              + Log Service
            </button>
          </div>

          {/* Add form */}
          {showAddMaint && (
            <div style={{ background: '#1a1d27', border: '1px solid #47a141', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>Log Maintenance Entry</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Vehicle *</label>
                  <select value={maintForm.vehicle_id} onChange={(e) => setMaintForm((f) => ({ ...f, vehicle_id: e.target.value }))}
                    style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px' }}>
                    <option value="">Select vehicle</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Date *</label>
                  <input type="date" value={maintForm.date} onChange={(e) => setMaintForm((f) => ({ ...f, date: e.target.value }))}
                    style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Service Type *</label>
                  <select value={maintForm.type} onChange={(e) => setMaintForm((f) => ({ ...f, type: e.target.value }))}
                    style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px' }}>
                    {MAINTENANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Performed By</label>
                  <input value={maintForm.performed_by} onChange={(e) => setMaintForm((f) => ({ ...f, performed_by: e.target.value }))}
                    placeholder="Shop or technician"
                    style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Cost ($)</label>
                  <input type="number" min="0" step="0.01" value={maintForm.cost} onChange={(e) => setMaintForm((f) => ({ ...f, cost: e.target.value }))}
                    placeholder="0.00"
                    style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Next Service Date</label>
                  <input type="date" value={maintForm.next_service_date} onChange={(e) => setMaintForm((f) => ({ ...f, next_service_date: e.target.value }))}
                    style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Description *</label>
                <textarea value={maintForm.description} onChange={(e) => setMaintForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="Describe the work performed"
                  style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={addMaintenance} disabled={saving || !maintForm.vehicle_id || !maintForm.description}
                  style={{ padding: '8px 20px', background: '#47a141', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving...' : 'Save Entry'}
                </button>
                <button onClick={() => setShowAddMaint(false)}
                  style={{ padding: '8px 16px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Maintenance table */}
          <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2e3347' }}>
                  {['Date', 'Unit', 'Type', 'Description', 'Performed By', 'Cost', 'Next Service', ''].map((h) => (
                    <th key={h} style={{ padding: '12px 16px', fontSize: 11, color: '#8892a4', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #2e3347' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#8892a4' }}>{m.date}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{m.fleet_vehicles?.name}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', background: '#1a2a3a', padding: '3px 8px', borderRadius: 5 }}>{m.type}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#f1f5f9', maxWidth: 200 }}>{m.description}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#8892a4' }}>{m.performed_by || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: m.cost ? '#47a141' : '#6b7280' }}>
                      {m.cost != null ? `$${Number(m.cost).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#8892a4' }}>{m.next_service_date || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => deleteMaint(m.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: '#8892a4', fontSize: 13 }}>
                {selectedVeh ? 'No maintenance records for this vehicle.' : 'No maintenance records yet. Click "+ Log Service" to add one.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
