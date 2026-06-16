import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ── Test data ─────────────────────────────────────────────────────────────────

const MAKES = ['Tesla'];
const PLATES = ['7TRK291', 'ABC-1234', '8XYZ902', '5MNP441', '3QRS777', '9JKL023', '2WVU556',
  '1ABD884', '6CEF112', '4GHI339', 'ZZ-99001', 'LM-55432', 'PQ-77810', 'TU-22934', 'VW-66129',
  'RX-11298', 'SY-84501', 'NZ-30017', 'AJ-44623', 'BK-59882', 'CL-71234', 'DM-88765', 'EN-93412',
  'FO-15678', 'GP-27890'];

function randMac(seed) {
  const h = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  const r = (s) => ((s * 1103515245 + 12345) & 0x7fffffff);
  let s = seed;
  return [0, 1, 2, 3, 4, 5].map(() => { s = r(s); return h(s % 256); }).join(':');
}

function randVin(seed) {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  let s = seed * 31337;
  const r = (n) => { s = ((s * 1103515245 + 12345) & 0x7fffffff); return s % n; };
  const prefix = '5YJ3E1EA';
  return prefix + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(() => chars[r(chars.length)]).join('');
}

function randDate(seed, daysAgo) {
  return new Date(Date.now() - daysAgo * 86400000 - (seed % 3600) * 1000).toISOString();
}

function getDemoVehicles() {
  return Array.from({ length: 25 }, (_, i) => {
    const n = i + 1;
    const sessions = 2 + (n * 7 % 14);
    const kwh = Math.round((sessions * (40 + (n * 17 % 120))) * 10) / 10;
    return {
      id: `demo-${n}`,
      mac_address: randMac(n * 997),
      vin: randVin(n * 1009),
      license_plate: PLATES[i],
      make: 'Tesla',
      model: 'Model Y',
      year: 2022 + (n % 3),
      notes: '',
      total_sessions: sessions,
      total_kwh: kwh,
      last_charged: randDate(n, n % 7),
      chargers: [],
      _demo: true,
    };
  });
}

function getDemoSessions(vehicle) {
  return Array.from({ length: vehicle.total_sessions }, (_, i) => ({
    id: `ds-${vehicle.id}-${i}`,
    charger_id: `PC-MOBILE-0${(i % 3) + 1}`,
    id_tag: vehicle.mac_address,
    start_time: randDate(i * 997, i * 3 + 1),
    stop_time: randDate(i * 997, i * 3),
    energy_kwh: Math.round((vehicle.total_kwh / vehicle.total_sessions) * 10) / 10,
    stop_reason: 'EVDisconnected',
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDuration(start, stop) {
  if (!start || !stop) return '—';
  const mins = Math.round((new Date(stop) - new Date(start)) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function shortVin(vin) {
  if (!vin) return null;
  return vin.length > 6 ? '...' + vin.slice(-6) : vin;
}

// ── VehicleEditForm ───────────────────────────────────────────────────────────

function VehicleEditForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    mac_address: initial?.mac_address || '',
    vin: initial?.vin || '',
    license_plate: initial?.license_plate || '',
    make: initial?.make || '',
    model: initial?.model || '',
    year: initial?.year || '',
    notes: initial?.notes || '',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const inp = { background: '#0f1117', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 11px', color: '#f1f5f9', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>MAC Address *</label>
          <input style={inp} value={form.mac_address} onChange={(e) => set('mac_address', e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
        </div>
        <div>
          <label style={lbl}>License Plate</label>
          <input style={inp} value={form.license_plate} onChange={(e) => set('license_plate', e.target.value)} placeholder="7TRK291" />
        </div>
        <div>
          <label style={lbl}>VIN Number</label>
          <input style={inp} value={form.vin} onChange={(e) => set('vin', e.target.value)} placeholder="5YJ3E1EA..." />
        </div>
        <div>
          <label style={lbl}>Year</label>
          <input style={inp} value={form.year} onChange={(e) => set('year', e.target.value)} placeholder="2023" type="number" />
        </div>
        <div>
          <label style={lbl}>Make</label>
          <input style={inp} value={form.make} onChange={(e) => set('make', e.target.value)} placeholder="Tesla" />
        </div>
        <div>
          <label style={lbl}>Model</label>
          <input style={inp} value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="Model Y" />
        </div>
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
          disabled={!form.mac_address || saving}
          style={{ background: !form.mac_address || saving ? '#22263a' : '#47a141', border: 'none', borderRadius: 7, padding: '8px 20px', color: !form.mac_address || saving ? '#8892a4' : '#fff', fontWeight: 700, fontSize: 13, cursor: !form.mac_address || saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── VehicleDetail ─────────────────────────────────────────────────────────────

function VehicleDetail({ vehicle, isDemo, onBack, onSave, onDelete, canEdit }) {
  const [sessions, setSessions] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isDemo) { setSessions(getDemoSessions(vehicle)); return; }
    async function load() {
      try {
        if (vehicle.id) {
          const res = await api.getVehicleSessions(vehicle.id);
          setSessions(res.sessions);
        } else {
          const res = await api.getMacSessions(vehicle.mac_address);
          setSessions(res.sessions);
        }
      } catch (err) {
        setError(err.message);
        setSessions([]);
      }
    }
    load();
  }, [vehicle, isDemo]);

  async function handleSave(form) {
    setSaving(true);
    try {
      const updated = vehicle.id
        ? await api.updateVehicle(vehicle.id, form)
        : await api.createVehicle(form);
      setEditing(false);
      if (onSave) onSave(updated);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Remove this vehicle profile? Session history is kept.')) return;
    setDeleting(true);
    try {
      await api.deleteVehicle(vehicle.id);
      if (onDelete) onDelete();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }

  const hasProfile = !!vehicle.vin || !!vehicle.license_plate;
  const title = vehicle.license_plate || shortVin(vehicle.vin) || vehicle.mac_address;

  return (
    <div>
      {/* Back nav */}
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#8892a4', fontSize: 13, cursor: 'pointer', padding: '0 0 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
        ← Back to Vehicles
      </button>

      {/* Header card */}
      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 14, padding: 24, marginBottom: 20 }}>
        {editing ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 18 }}>Edit Vehicle</div>
            <VehicleEditForm initial={vehicle} onSave={handleSave} onCancel={() => setEditing(false)} saving={saving} />
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#f1f5f9', letterSpacing: '.02em' }}>
                  {vehicle.license_plate || <span style={{ color: '#4b5563' }}>No plate</span>}
                </div>
                {vehicle.make && (
                  <div style={{ fontSize: 14, color: '#8892a4', marginTop: 4 }}>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </div>
                )}
              </div>
              {canEdit && !isDemo && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditing(true)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '7px 14px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>
                    Edit
                  </button>
                  {vehicle.id && (
                    <button onClick={handleDelete} disabled={deleting} style={{ background: '#3f1515', border: '1px solid #ef4444', borderRadius: 7, padding: '7px 14px', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>
                      {deleting ? '...' : 'Remove'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              <InfoCell label="VIN Number" value={vehicle.vin || '—'} mono />
              <InfoCell label="MAC Address" value={vehicle.mac_address} mono />
              <InfoCell label="Total Sessions" value={vehicle.total_sessions ?? '—'} />
              <InfoCell label="Total kWh Charged" value={vehicle.total_kwh != null ? `${vehicle.total_kwh} kWh` : '—'} />
              <InfoCell label="Last Charged" value={fmtDate(vehicle.last_charged)} />
              {vehicle.notes && <InfoCell label="Notes" value={vehicle.notes} />}
            </div>

            {!hasProfile && !isDemo && canEdit && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: '#1f1a00', border: '1px solid #f59e0b44', borderRadius: 8, fontSize: 12, color: '#f59e0b' }}>
                This MAC address has been seen charging but has no profile yet. Click Edit to assign a VIN and license plate.
              </div>
            )}
          </>
        )}
      </div>

      {/* Sessions */}
      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ background: '#22263a', borderBottom: '1px solid #2e3347', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>Charging Sessions</span>
          {sessions && <span style={{ fontSize: 12, color: '#8892a4' }}>{sessions.length} sessions</span>}
        </div>

        {error && <div style={{ padding: 20, color: '#ef4444', fontSize: 13 }}>{error}</div>}

        {sessions === null && (
          <div style={{ padding: 40, textAlign: 'center', color: '#8892a4', fontSize: 13 }}>Loading sessions...</div>
        )}

        {sessions !== null && sessions.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#8892a4', fontSize: 13 }}>No sessions found for this vehicle.</div>
        )}

        {sessions && sessions.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2e3347' }}>
                {['Date', 'Charger', 'Duration', 'kWh', 'Stop Reason'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.id || i} style={{ borderBottom: '1px solid #2e334722' }}>
                  <td style={{ padding: '10px 16px', color: '#f1f5f9' }}>{fmtDate(s.start_time)}</td>
                  <td style={{ padding: '10px 16px', color: '#8892a4', fontFamily: 'monospace', fontSize: 12 }}>{s.charger_id}</td>
                  <td style={{ padding: '10px 16px', color: '#8892a4' }}>{fmtDuration(s.start_time, s.stop_time)}</td>
                  <td style={{ padding: '10px 16px', color: s.energy_kwh ? '#47a141' : '#4b5563', fontWeight: 600 }}>
                    {s.energy_kwh != null ? `${parseFloat(s.energy_kwh).toFixed(1)} kWh` : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 12 }}>{s.stop_reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value, mono }) {
  return (
    <div style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#f1f5f9', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

// ── VehicleRow ────────────────────────────────────────────────────────────────

function VehicleRow({ v, showField, onClick }) {
  const displayLabel = () => {
    if (showField === 'vin') return shortVin(v.vin) || <span style={{ color: '#4b5563' }}>No VIN</span>;
    if (showField === 'plate') return v.license_plate || <span style={{ color: '#4b5563' }}>No plate</span>;
    return (
      <span>
        {v.license_plate || <span style={{ color: '#4b5563' }}>No plate</span>}
        {v.vin && <span style={{ color: '#6b7280', fontSize: 11, marginLeft: 8 }}>·  {shortVin(v.vin)}</span>}
      </span>
    );
  };

  return (
    <tr
      onClick={onClick}
      style={{ borderBottom: '1px solid #2e334722', cursor: 'pointer', transition: 'background 0.1s' }}
      onMouseEnter={(e) => e.currentTarget.style.background = '#22263a'}
      onMouseLeave={(e) => e.currentTarget.style.background = ''}
    >
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{displayLabel()}</div>
        {v.make && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{v.year} {v.make} {v.model}</div>}
      </td>
      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>
        {v.mac_address}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#f1f5f9', fontWeight: 600 }}>
        {v.total_sessions ?? 0}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#47a141', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {v.total_kwh != null ? `${v.total_kwh.toLocaleString()} kWh` : '—'}
      </td>
      <td style={{ padding: '12px 16px', color: '#8892a4', fontSize: 12 }}>
        {fmtDate(v.last_charged)}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Vehicles() {
  const profile = useProfile();
  const canEdit = profile?.role === 'admin' || profile?.role === 'operator';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showField, setShowField] = useState('both');
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [tab, setTab] = useState('registered'); // 'registered' | 'unregistered'

  const load = useCallback(async () => {
    try {
      const res = await api.getVehicles();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const demoVehicles = useMemo(() => getDemoVehicles(), []);

  const displayData = testMode
    ? { profiles: demoVehicles, unregistered: [] }
    : (data || { profiles: [], unregistered: [] });

  const q = search.toLowerCase();
  const filteredProfiles = useMemo(() => {
    if (!q) return displayData.profiles;
    return displayData.profiles.filter((v) =>
      (v.mac_address || '').toLowerCase().includes(q) ||
      (v.vin || '').toLowerCase().includes(q) ||
      (v.license_plate || '').toLowerCase().includes(q) ||
      (v.make || '').toLowerCase().includes(q) ||
      (v.model || '').toLowerCase().includes(q)
    );
  }, [displayData.profiles, q]);

  const filteredUnregistered = useMemo(() => {
    if (!q) return displayData.unregistered;
    return displayData.unregistered.filter((v) => (v.id_tag || '').toLowerCase().includes(q));
  }, [displayData.unregistered, q]);

  const totalKwh = useMemo(() => displayData.profiles.reduce((s, v) => s + (v.total_kwh || 0), 0), [displayData.profiles]);
  const totalSessions = useMemo(() => displayData.profiles.reduce((s, v) => s + (v.total_sessions || 0), 0), [displayData.profiles]);

  async function handleAdd(form) {
    if (testMode) { setShowAdd(false); return; }
    setAddSaving(true);
    try {
      await api.createVehicle(form);
      setShowAdd(false);
      load();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setAddSaving(false);
    }
  }

  async function doExport() {
    if (testMode) {
      const rows = demoVehicles.map((v) =>
        [v.license_plate, v.vin, v.make, v.model, v.year, v.mac_address, v.total_sessions, v.total_kwh, fmtDate(v.last_charged), v.notes || ''].join(',')
      );
      const csv = ['license_plate,vin,make,model,year,mac_address,total_sessions,total_kwh,last_charged,notes', ...rows].join('\r\n');
      triggerDownload(new Blob([csv], { type: 'text/csv' }), 'vehicles-demo.csv');
      return;
    }
    setExporting(true);
    try {
      const { blob, filename } = await api.downloadVehicleExport();
      triggerDownload(blob, filename);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  }

  // Navigate to vehicle detail
  if (selected) {
    const isDemo = !!selected._demo;
    return (
      <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
        <VehicleDetail
          vehicle={selected}
          isDemo={isDemo}
          canEdit={canEdit}
          onBack={() => setSelected(null)}
          onSave={() => { setSelected(null); load(); }}
          onDelete={() => { setSelected(null); load(); }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Vehicle Tracking</h1>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>
            Track charging history per vehicle — pair MAC addresses to VIN numbers and license plates
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowHelp((h) => !h)}
            style={{ background: showHelp ? '#1a2e1a' : '#22263a', border: `1px solid ${showHelp ? '#47a14166' : '#2e3347'}`, borderRadius: 7, padding: '7px 14px', color: showHelp ? '#47a141' : '#8892a4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            How it works
          </button>
          <button
            onClick={() => { setTestMode((m) => !m); setSelected(null); }}
            style={{ background: testMode ? '#2a1f00' : '#22263a', border: `1px solid ${testMode ? '#f59e0b' : '#2e3347'}`, borderRadius: 7, padding: '7px 14px', color: testMode ? '#f59e0b' : '#8892a4', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: testMode ? '#f59e0b' : '#4b5563', display: 'inline-block', boxShadow: testMode ? '0 0 6px #f59e0b' : 'none' }} />
            {testMode ? 'Test Mode ON' : 'Test Mode'}
          </button>
          <button onClick={doExport} disabled={exporting} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '7px 14px', color: '#8892a4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          {canEdit && (
            <button onClick={() => setShowAdd(true)} style={{ background: '#47a141', border: 'none', borderRadius: 7, padding: '7px 16px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + Add Vehicle
            </button>
          )}
        </div>
      </div>

      {/* Test mode banner */}
      {testMode && (
        <div style={{ background: '#2a1f00', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: '#f59e0b', color: '#000', fontWeight: 800, fontSize: 10, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>Test Mode</span>
          <span style={{ fontSize: 12, color: '#fbbf24' }}>Showing 25 simulated Tesla Model Y vehicles. Click any row to see details.</span>
        </div>
      )}

      {/* How it works */}
      {showHelp && (
        <div style={{ background: '#1a1d27', border: '1px solid #47a14144', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#47a141', marginBottom: 12 }}>How Vehicle Tracking Works</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {[
              { step: '1', title: 'MAC Collected Automatically', body: 'When a vehicle charges, the charger passes its identifier (MAC address) in the OCPP StartTransaction message. This is captured and stored with every session.' },
              { step: '2', title: 'Pair MAC to Vehicle', body: 'Record the MAC address shown on the charger screen (video if needed). Then click "+ Add Vehicle" to pair that MAC to a VIN number and license plate.' },
              { step: '3', title: 'Full History Unlocked', body: 'Once paired, all past and future sessions for that MAC are linked to the vehicle profile — total kWh, session count, dates, chargers used.' },
              { step: '4', title: 'Export Billing Proof', body: 'Use "Export CSV" to generate a report showing each vehicle (VIN + plate), total kWh charged, and session count. Share with customers as billing proof.' },
            ].map(({ step, title, body }) => (
              <div key={step} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#47a14133', color: '#47a141', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{step}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{title}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8892a4', lineHeight: 1.6, paddingLeft: 30 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add vehicle modal */}
      {showAdd && (
        <div style={{ background: '#1a1d27', border: '1px solid #47a14166', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', marginBottom: 16 }}>Add Vehicle Profile</div>
          <VehicleEditForm initial={null} onSave={handleAdd} onCancel={() => setShowAdd(false)} saving={addSaving} />
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard label="Registered Vehicles" value={displayData.profiles.length} />
        <StatCard label="Total Sessions" value={totalSessions.toLocaleString()} color="#3b82f6" />
        <StatCard label="Total kWh Delivered" value={`${totalKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh`} color="#47a141" />
      </div>

      {/* Search + display toggle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by license plate, VIN, MAC address, or model..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 240, background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, padding: '9px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
        />
        <div style={{ display: 'flex', background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, overflow: 'hidden' }}>
          {[['both', 'Plate + VIN'], ['plate', 'Plate Only'], ['vin', 'VIN Only']].map(([val, lbl]) => (
            <button key={val} onClick={() => setShowField(val)} style={{ background: showField === val ? '#47a14122' : 'transparent', border: 'none', borderRight: '1px solid #2e3347', padding: '7px 14px', color: showField === val ? '#47a141' : '#8892a4', fontSize: 12, fontWeight: showField === val ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap', ':last-child': { borderRight: 'none' } }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '1px solid #2e3347' }}>
        {[['registered', `Registered (${filteredProfiles.length})`], ['unregistered', `Unregistered MACs (${filteredUnregistered.length})`]].map(([key, lbl]) => (
          <button key={key} onClick={() => setTab(key)} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === key ? '#47a141' : 'transparent'}`, padding: '10px 18px', color: tab === key ? '#47a141' : '#8892a4', fontSize: 13, fontWeight: tab === key ? 700 : 400, cursor: 'pointer', marginBottom: -1 }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Vehicle table */}
      {error && !testMode && (
        <div style={{ padding: '20px 0', color: '#ef4444', fontSize: 13 }}>{error}</div>
      )}

      {loading && !testMode && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#8892a4' }}>Loading vehicles...</div>
      )}

      {tab === 'registered' && (
        <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
          {filteredProfiles.length === 0 ? (
            <div style={{ padding: '60px 40px', textAlign: 'center', color: '#8892a4' }}>
              <div style={{ fontSize: 16, marginBottom: 8 }}>
                {search ? 'No vehicles match your search' : 'No vehicle profiles yet'}
              </div>
              <div style={{ fontSize: 13 }}>
                {search ? 'Try a different search term' : 'Add a vehicle profile to pair a MAC address to a VIN and license plate.'}
              </div>
              {!search && canEdit && (
                <button onClick={() => setShowAdd(true)} style={{ marginTop: 16, background: '#47a141', border: 'none', borderRadius: 7, padding: '9px 20px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  + Add First Vehicle
                </button>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2e3347' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Vehicle</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>MAC Address</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Sessions</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Total kWh</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Last Charged</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((v) => (
                  <VehicleRow key={v.id || v.mac_address} v={v} showField={showField} onClick={() => setSelected(v)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'unregistered' && (
        <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
          {filteredUnregistered.length === 0 ? (
            <div style={{ padding: '60px 40px', textAlign: 'center', color: '#8892a4' }}>
              <div style={{ fontSize: 16, marginBottom: 8 }}>No unregistered vehicles</div>
              <div style={{ fontSize: 13 }}>All vehicle identifiers seen in sessions have been assigned a profile.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2e3347' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>MAC / Identifier</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Sessions</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Total kWh</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Last Seen</th>
                  <th style={{ padding: '10px 16px', width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {filteredUnregistered.map((v) => (
                  <tr
                    key={v.id_tag}
                    style={{ borderBottom: '1px solid #2e334722', cursor: 'pointer' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#22263a'}
                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    onClick={() => setSelected({ mac_address: v.id_tag, total_sessions: v.total_sessions, total_kwh: v.total_kwh, last_charged: v.last_charged })}
                  >
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: '#f59e0b' }}>{v.id_tag}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#f1f5f9', fontWeight: 600 }}>{v.total_sessions}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#47a141', fontWeight: 600 }}>{v.total_kwh != null ? `${v.total_kwh} kWh` : '—'}</td>
                    <td style={{ padding: '12px 16px', color: '#8892a4', fontSize: 12 }}>{fmtDate(v.last_charged)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {canEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowAdd(true); }}
                          style={{ background: '#22263a', border: '1px solid #47a14166', borderRadius: 6, padding: '4px 10px', color: '#47a141', fontSize: 11, cursor: 'pointer' }}
                        >
                          Register
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '18px 22px' }}>
      <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || '#f1f5f9' }}>{value}</div>
    </div>
  );
}
