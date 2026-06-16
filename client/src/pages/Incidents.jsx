import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

const INCIDENT_TYPES = ['Accident', 'Near Miss', 'Equipment Failure', 'Injury', 'Theft', 'Property Damage', 'Other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'under_review', 'resolved', 'closed'];

const SEV_STYLE = {
  low:      { color: '#3b82f6', bg: '#3b82f620', label: 'Low' },
  medium:   { color: '#f59e0b', bg: '#f59e0b20', label: 'Medium' },
  high:     { color: '#ef4444', bg: '#ef444420', label: 'High' },
  critical: { color: '#dc2626', bg: '#dc262630', label: 'Critical' },
};

const STATUS_STYLE = {
  open:         { color: '#ef4444', label: 'Open' },
  under_review: { color: '#f59e0b', label: 'Under Review' },
  resolved:     { color: '#47a141', label: 'Resolved' },
  closed:       { color: '#6b7280', label: 'Closed' },
};

const DEMO_VEHICLES = [
  { id: 'demo-1', unit_id: 'EMV-001' }, { id: 'demo-2', unit_id: 'EMV-002' },
  { id: 'demo-3', unit_id: 'EMV-003' }, { id: 'demo-4', unit_id: 'EMV-004' },
  { id: 'demo-5', unit_id: 'DSL-001' }, { id: 'demo-6', unit_id: 'DSL-002' },
];

const DEMO_INCIDENTS = [
  {
    id: 'di-1',
    date: '2026-06-10',
    time: '14:23',
    fleet_vehicles: { unit_id: 'EMV-002' },
    vehicle_id: 'demo-2',
    driver_name: 'Carlos Mendez',
    incident_type: 'Near Miss',
    severity: 'medium',
    location: 'La Cienega Blvd at Century Blvd, Inglewood',
    description: 'Vehicle cut off EMV-002 during unloading approach. No contact. Driver applied emergency brakes.',
    injuries: 'None',
    property_damage: 'None',
    witnesses: 'Jose Reyes (following truck)',
    reported_by: 'Carlos Mendez',
    status: 'resolved',
    resolution: 'Reviewed dashcam footage. Sent defensive driving reminder to all drivers.',
    created_at: '2026-06-10T21:00:00Z',
  },
  {
    id: 'di-2',
    date: '2026-05-28',
    time: '09:45',
    fleet_vehicles: { unit_id: 'EMV-004' },
    vehicle_id: 'demo-4',
    driver_name: 'Marcus Johnson',
    incident_type: 'Equipment Failure',
    severity: 'high',
    location: '320 E Harry Bridges Blvd, Wilmington (Depot)',
    description: 'Battery management fault code F-0074. Truck would not accept charge. Unit taken out of service.',
    injuries: 'None',
    property_damage: 'Battery module — under warranty',
    witnesses: '',
    reported_by: 'Marcus Johnson',
    status: 'under_review',
    resolution: '',
    created_at: '2026-05-28T16:30:00Z',
  },
  {
    id: 'di-3',
    date: '2026-04-15',
    time: '07:10',
    fleet_vehicles: { unit_id: 'DSL-001' },
    vehicle_id: 'demo-5',
    driver_name: 'Darnell Brooks',
    incident_type: 'Property Damage',
    severity: 'low',
    location: 'Depot parking lot, Wilmington',
    description: 'Minor contact with dock gate while backing in. Dent on rear bumper guard. Gate undamaged.',
    injuries: 'None',
    property_damage: 'Rear bumper guard dent — estimated $800',
    witnesses: 'Site camera footage available',
    reported_by: 'Darnell Brooks',
    status: 'closed',
    resolution: 'Bumper guard replaced. Driver counseled. Incident documented in file.',
    created_at: '2026-04-15T08:00:00Z',
  },
];

const BLANK_FORM = {
  date: new Date().toISOString().slice(0, 10),
  time: '',
  vehicle_id: '',
  driver_name: '',
  incident_type: 'Accident',
  severity: 'medium',
  location: '',
  description: '',
  injuries: '',
  property_damage: '',
  witnesses: '',
  reported_by: '',
};

export default function Incidents() {
  const profile = useProfile();
  const role = profile?.role;
  const canReview = role === 'admin' || role === 'operator';

  const [testMode,   setTestMode]   = useState(false);
  const [incidents,  setIncidents]  = useState([]);
  const [vehicles,   setVehicles]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(BLANK_FORM);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [filterSev,  setFilterSev]  = useState('');
  const [filterStat, setFilterStat] = useState('');
  const [editStatus, setEditStatus] = useState({});
  const [resolution, setResolution] = useState({});

  useEffect(() => {
    if (testMode) {
      setIncidents(DEMO_INCIDENTS);
      setVehicles(DEMO_VEHICLES);
      setLoading(false);
      return;
    }
    load();
  }, [testMode]);

  async function load() {
    setLoading(true);
    try {
      const [inc, veh] = await Promise.all([api.getIncidents(), api.getFleetVehicles()]);
      setIncidents(inc);
      setVehicles(veh);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!form.description.trim() || !form.incident_type) return setError('Description and type are required.');
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, vehicle_id: form.vehicle_id || null };
      if (testMode) {
        const veh = vehicles.find((v) => v.id === payload.vehicle_id);
        setIncidents((prev) => [{ ...payload, id: 'di-' + Date.now(), fleet_vehicles: veh ? { unit_id: veh.unit_id } : null, status: 'open', created_at: new Date().toISOString() }, ...prev]);
      } else {
        const rec = await api.createIncident(payload);
        setIncidents((prev) => [rec, ...prev]);
      }
      setShowForm(false);
      setForm(BLANK_FORM);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id, status, res) {
    try {
      const body = { status };
      if (res) body.resolution = res;
      if (testMode) {
        setIncidents((prev) => prev.map((i) => i.id === id ? { ...i, ...body } : i));
      } else {
        const updated = await api.updateIncident(id, body);
        setIncidents((prev) => prev.map((i) => i.id === id ? updated : i));
      }
      setEditStatus((e) => ({ ...e, [id]: false }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteIncident(id) {
    if (!window.confirm('Delete this incident report?')) return;
    try {
      if (!testMode) await api.deleteIncident(id);
      setIncidents((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  const filtered = incidents.filter((i) => {
    if (filterSev  && i.severity !== filterSev) return false;
    if (filterStat && i.status   !== filterStat) return false;
    return true;
  });

  const openCount     = incidents.filter((i) => i.status === 'open' || i.status === 'under_review').length;
  const criticalCount = incidents.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
  const resolvedCount = incidents.filter((i) => i.status === 'resolved' || i.status === 'closed').length;

  return (
    <div style={{ padding: 32, background: '#0f1117', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Safety & Incident Reports</h1>
          <p style={{ fontSize: 13, color: '#8892a4', margin: '4px 0 0' }}>Log, track, and resolve safety events across the fleet</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <div onClick={() => setTestMode((t) => !t)} style={{ width: 36, height: 20, borderRadius: 10, background: testMode ? '#47a141' : '#2e3347', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: testMode ? 19 : 3, transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: 12, color: testMode ? '#47a141' : '#8892a4', fontWeight: 600 }}>Test Mode</span>
          </label>
          <button onClick={() => { setShowForm(true); setExpanded(null); }}
            style={{ padding: '8px 18px', background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + Report Incident
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#2a1215', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 16px', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>{error}</div>}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Open / Under Review', value: openCount,     color: '#ef4444' },
          { label: 'High Severity',       value: criticalCount, color: '#f59e0b' },
          { label: 'Resolved / Closed',   value: resolvedCount, color: '#47a141' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Report form */}
      {showForm && (
        <div style={{ background: '#1a1d27', border: '1px solid #ef4444', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 18 }}>New Incident Report</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Date *</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Time</label>
              <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Vehicle</label>
              <select value={form.vehicle_id} onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}
                style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px' }}>
                <option value="">None / Unknown</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.unit_id}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Driver Name</label>
              <input value={form.driver_name} onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))}
                placeholder="Full name"
                style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Incident Type *</label>
              <select value={form.incident_type} onChange={(e) => setForm((f) => ({ ...f, incident_type: e.target.value }))}
                style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px' }}>
                {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Severity *</label>
              <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px' }}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Location</label>
            <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Address or description of location"
              style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>Description *</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3} placeholder="What happened?"
              style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 18 }}>
            {[
              { label: 'Injuries', key: 'injuries', placeholder: 'None or describe' },
              { label: 'Property Damage', key: 'property_damage', placeholder: 'None or describe' },
              { label: 'Witnesses', key: 'witnesses', placeholder: 'Names or "None"' },
            ].map((f) => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>{f.label}</label>
                <input value={form[f.key]} onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: '100%', marginTop: 4, background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={submit} disabled={saving}
              style={{ padding: '9px 22px', background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Submitting...' : 'Submit Report'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding: '9px 16px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 8, color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <select value={filterSev} onChange={(e) => setFilterSev(e.target.value)}
          style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '7px 12px' }}>
          <option value="">All Severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select value={filterStat} onChange={(e) => setFilterStat(e.target.value)}
          style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 13, padding: '7px 12px' }}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s]?.label || s}</option>)}
        </select>
        {(filterSev || filterStat) && (
          <button onClick={() => { setFilterSev(''); setFilterStat(''); }}
            style={{ padding: '7px 12px', background: 'none', border: '1px solid #2e3347', borderRadius: 8, color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {/* Incident list */}
      {loading ? (
        <div style={{ color: '#8892a4', fontSize: 14, textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((inc) => {
            const sev = SEV_STYLE[inc.severity] || SEV_STYLE.low;
            const st  = STATUS_STYLE[inc.status] || STATUS_STYLE.open;
            const isOpen = expanded === inc.id;
            return (
              <div key={inc.id} style={{ background: '#1a1d27', border: `1px solid ${isOpen ? '#2e4060' : '#2e3347'}`, borderRadius: 12, overflow: 'hidden' }}>
                {/* Summary row */}
                <div
                  onClick={() => setExpanded(isOpen ? null : inc.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', cursor: 'pointer' }}
                >
                  <div style={{ width: 4, borderRadius: 2, background: sev.color, alignSelf: 'stretch', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{inc.incident_type}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: sev.color, background: sev.bg, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' }}>{inc.severity}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: st.color, padding: '2px 7px', borderRadius: 4, background: `${st.color}20`, textTransform: 'uppercase' }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#8892a4' }}>
                      {inc.date}{inc.time ? ` · ${inc.time}` : ''}{inc.fleet_vehicles ? ` · ${inc.fleet_vehicles.unit_id}` : ''}{inc.driver_name ? ` · ${inc.driver_name}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, color: '#8892a4', userSelect: 'none' }}>{isOpen ? '▲' : '▼'}</div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ padding: '0 20px 20px', borderTop: '1px solid #2e3347' }}>
                    <div style={{ paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 600, marginBottom: 4 }}>DESCRIPTION</div>
                        <div style={{ fontSize: 13, color: '#f1f5f9', lineHeight: 1.6 }}>{inc.description}</div>
                      </div>
                      <div>
                        {inc.location && (
                          <>
                            <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 600, marginBottom: 4 }}>LOCATION</div>
                            <div style={{ fontSize: 13, color: '#f1f5f9', marginBottom: 12 }}>{inc.location}</div>
                          </>
                        )}
                        {inc.injuries && (
                          <>
                            <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 600, marginBottom: 4 }}>INJURIES</div>
                            <div style={{ fontSize: 13, color: '#f1f5f9', marginBottom: 12 }}>{inc.injuries}</div>
                          </>
                        )}
                        {inc.property_damage && (
                          <>
                            <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 600, marginBottom: 4 }}>PROPERTY DAMAGE</div>
                            <div style={{ fontSize: 13, color: '#f1f5f9', marginBottom: 12 }}>{inc.property_damage}</div>
                          </>
                        )}
                        {inc.witnesses && (
                          <>
                            <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 600, marginBottom: 4 }}>WITNESSES</div>
                            <div style={{ fontSize: 13, color: '#f1f5f9' }}>{inc.witnesses}</div>
                          </>
                        )}
                      </div>
                    </div>

                    {inc.resolution && (
                      <div style={{ marginTop: 14, padding: 12, background: '#47a14115', border: '1px solid #47a14140', borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: '#47a141', fontWeight: 600, marginBottom: 4 }}>RESOLUTION</div>
                        <div style={{ fontSize: 13, color: '#f1f5f9' }}>{inc.resolution}</div>
                      </div>
                    )}

                    {/* Admin status update */}
                    {canReview && inc.status !== 'closed' && (
                      <div style={{ marginTop: 16, padding: 14, background: '#22263a', borderRadius: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#8892a4', marginBottom: 10 }}>Update Status</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                          {STATUSES.filter((s) => s !== inc.status).map((s) => (
                            <button key={s} onClick={() => updateStatus(inc.id, s, resolution[inc.id])}
                              style={{ padding: '5px 14px', background: '#0f1117', border: `1px solid ${STATUS_STYLE[s]?.color || '#2e3347'}`, borderRadius: 7, color: STATUS_STYLE[s]?.color || '#8892a4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              Mark {STATUS_STYLE[s]?.label || s}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={resolution[inc.id] || ''}
                          onChange={(e) => setResolution((r) => ({ ...r, [inc.id]: e.target.value }))}
                          placeholder="Resolution notes (optional)"
                          rows={2}
                          style={{ width: '100%', background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', fontSize: 12, padding: '7px 10px', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                      </div>
                    )}

                    {role === 'admin' && (
                      <div style={{ marginTop: 12 }}>
                        <button onClick={() => deleteIncident(inc.id)}
                          style={{ background: 'none', border: '1px solid #ef4444', borderRadius: 7, color: '#ef4444', fontSize: 12, fontWeight: 600, padding: '5px 14px', cursor: 'pointer' }}>
                          Delete Report
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#8892a4', fontSize: 13 }}>
              {(filterSev || filterStat) ? 'No incidents match your filters.' : 'No incident reports. Enable Test Mode or click "+ Report Incident".'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
