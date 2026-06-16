import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0f1117', card: '#1a1d27', panel: '#22263a', border: '#2e3347',
  text: '#f1f5f9', muted: '#8892a4',
  green: '#47a141', blue: '#3b82f6', amber: '#f59e0b', red: '#ef4444', purple: '#a855f7',
};

const ROUTE = {
  warehouse: '320 E Harry Bridges Blvd, Wilmington, CA 90744',
  customer: '11222 S La Cienega Blvd, Inglewood, CA 90304',
  distance: 12.4,
  energyPerMile: 2.5,
};

const DRIVERS = ['Marcus T.', 'Jasmine R.', 'Diego M.', 'Aaliyah W.', 'Kevin O.', 'Sofia L.'];

function fmt(n, d = 1) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function DirectionBadge({ direction }) {
  const isOut = direction === 'outbound';
  const color = isOut ? C.blue : C.green;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 999, padding: '2px 9px' }}>
      {isOut ? 'Outbound' : 'Return'}
    </span>
  );
}

const labelStyle = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.muted, marginBottom: 6 };
const inputStyle = { width: '100%', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box' };

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent || C.text }}>{value}</div>
    </div>
  );
}

// ── Trip form ─────────────────────────────────────────────────────────────────
function TripForm({ vehicles, settings, defaultDriver, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    vehicle_id: vehicles[0]?.id || '',
    driver_name: defaultDriver || '',
    trip_date: today,
    direction: 'outbound',
    start_soc_pct: '',
    end_soc_pct: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const distance = Number(settings?.route_distance_miles ?? ROUTE.distance);
  const energyPerMile = Number(settings?.energy_per_mile_kwh ?? ROUTE.energyPerMile);

  // Live preview of computed energy + efficiency
  const vehicle = vehicles.find((v) => v.id === form.vehicle_id);
  let energy;
  if (form.start_soc_pct !== '' && form.end_soc_pct !== '' && vehicle?.capacity_kwh) {
    energy = ((Number(form.start_soc_pct) - Number(form.end_soc_pct)) / 100) * Number(vehicle.capacity_kwh);
  } else {
    energy = distance * energyPerMile;
  }
  const efficiency = distance > 0 ? energy / distance : 0;

  async function save() {
    if (!form.vehicle_id) { setError('Select a vehicle.'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.createTripLog({
        vehicle_id: form.vehicle_id,
        driver_name: form.driver_name || null,
        trip_date: form.trip_date,
        direction: form.direction,
        start_soc_pct: form.start_soc_pct !== '' ? Number(form.start_soc_pct) : null,
        end_soc_pct: form.end_soc_pct !== '' ? Number(form.end_soc_pct) : null,
        notes: form.notes || null,
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
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 24px', marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Log Trip Leg</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <div style={labelStyle}>Vehicle</div>
          <select value={form.vehicle_id} onChange={(e) => setField('vehicle_id', e.target.value)} style={inputStyle}>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.unit_id}{v.type === 'diesel' ? ' (diesel)' : ''}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Driver</div>
          <input value={form.driver_name} onChange={(e) => setField('driver_name', e.target.value)} placeholder="Driver name" style={inputStyle} list="driver-suggestions" />
          <datalist id="driver-suggestions">{DRIVERS.map((d) => <option key={d} value={d} />)}</datalist>
        </div>
        <div>
          <div style={labelStyle}>Date</div>
          <input type="date" value={form.trip_date} onChange={(e) => setField('trip_date', e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <div style={labelStyle}>Direction</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ v: 'outbound', l: 'Outbound', c: C.blue }, { v: 'return', l: 'Return', c: C.green }].map((o) => (
              <button key={o.v} onClick={() => setField('direction', o.v)}
                style={{ flex: 1, padding: '9px 8px', borderRadius: 8, border: `1px solid ${form.direction === o.v ? o.c : C.border}`, background: form.direction === o.v ? `${o.c}22` : C.panel, color: form.direction === o.v ? o.c : C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Start SOC %</div>
          <input type="number" min="0" max="100" value={form.start_soc_pct} onChange={(e) => setField('start_soc_pct', e.target.value)} placeholder="e.g. 90" style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>End SOC %</div>
          <input type="number" min="0" max="100" value={form.end_soc_pct} onChange={(e) => setField('end_soc_pct', e.target.value)} placeholder="e.g. 75" style={inputStyle} />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Notes</div>
        <input value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Optional notes" style={inputStyle} />
      </div>

      {/* Computed preview */}
      <div style={{ display: 'flex', gap: 20, padding: '12px 16px', background: C.panel, borderRadius: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>Distance</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmt(distance)} mi</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>Energy Used</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.green }}>{fmt(energy)} kWh</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>Efficiency</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.amber }}>{fmt(efficiency, 2)} kWh/mi</div>
        </div>
      </div>

      {error && <div style={{ padding: '10px 14px', background: '#ef444418', border: `1px solid #ef444444`, borderRadius: 8, color: C.red, fontSize: 12, marginBottom: 14 }}>{error}</div>}

      <button onClick={save} disabled={saving}
        style={{ padding: '9px 24px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : 'Save Trip'}
      </button>
    </div>
  );
}

// ── Fleet section ─────────────────────────────────────────────────────────────
function FleetSection({ vehicles, isAdmin, onChanged }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ unit_id: '', type: 'emv', capacity_kwh: '', make: '', model: '', year: '' });
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!form.unit_id) return;
    setSaving(true);
    try {
      await api.createFuelVehicle({
        unit_id: form.unit_id,
        type: form.type,
        capacity_kwh: form.capacity_kwh ? Number(form.capacity_kwh) : null,
        make: form.make || null,
        model: form.model || null,
        year: form.year ? Number(form.year) : null,
      });
      setForm({ unit_id: '', type: 'emv', capacity_kwh: '', make: '', model: '', year: '' });
      setAdding(false);
      onChanged();
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
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Fleet Vehicles ({vehicles.length})</span>
        <span style={{ color: C.muted, fontSize: 13 }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 22px 22px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  <th style={{ padding: '8px 10px' }}>Unit ID</th>
                  <th style={{ padding: '8px 10px' }}>Type</th>
                  <th style={{ padding: '8px 10px' }}>Capacity</th>
                  <th style={{ padding: '8px 10px' }}>Make / Model / Year</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} style={{ borderTop: `1px solid ${C.border}`, color: C.text }}>
                    <td style={{ padding: '9px 10px', fontWeight: 600 }}>{v.unit_id}</td>
                    <td style={{ padding: '9px 10px', color: v.type === 'diesel' ? C.amber : C.green, textTransform: 'uppercase', fontSize: 11, fontWeight: 700 }}>{v.type}</td>
                    <td style={{ padding: '9px 10px', color: C.muted }}>{v.capacity_kwh ? `${fmt(v.capacity_kwh, 0)} kWh` : '—'}</td>
                    <td style={{ padding: '9px 10px', color: C.muted }}>{[v.make, v.model, v.year].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isAdmin && (adding ? (
            <div style={{ marginTop: 16, padding: 16, background: C.panel, borderRadius: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 12 }}>
                <input value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} placeholder="Unit ID" style={inputStyle} />
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                  <option value="emv">emv</option><option value="diesel">diesel</option>
                </select>
                <input value={form.capacity_kwh} onChange={(e) => setForm({ ...form, capacity_kwh: e.target.value })} placeholder="kWh" type="number" style={inputStyle} />
                <input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="Make" style={inputStyle} />
                <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Model" style={inputStyle} />
                <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="Year" type="number" style={inputStyle} />
              </div>
              <button onClick={add} disabled={saving} style={{ padding: '8px 18px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 8 }}>{saving ? 'Saving…' : 'Save Vehicle'}</button>
              <button onClick={() => setAdding(false)} style={{ padding: '8px 18px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ marginTop: 16, padding: '8px 18px', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Add Vehicle</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings section ──────────────────────────────────────────────────────────
function SettingsSection({ settings, isAdmin, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        monthly_report_enabled: !!settings.monthly_report_enabled,
        report_emails_raw: (settings.report_emails || []).join(', '),
        route_distance_miles: settings.route_distance_miles ?? 12.4,
        energy_per_mile_kwh: settings.energy_per_mile_kwh ?? 2.5,
      });
    }
  }, [settings]);

  if (!form) return null;

  async function save() {
    setSaving(true);
    try {
      await api.saveFuelSettings({
        monthly_report_enabled: form.monthly_report_enabled,
        report_emails: form.report_emails_raw.split(',').map((e) => e.trim()).filter(Boolean),
        route_distance_miles: Number(form.route_distance_miles),
        energy_per_mile_kwh: Number(form.energy_per_mile_kwh),
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
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginTop: 16 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', background: 'none', border: 'none', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Settings</span>
        <span style={{ color: C.muted, fontSize: 13 }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 22px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Monthly report email</span>
            <button onClick={() => isAdmin && setForm({ ...form, monthly_report_enabled: !form.monthly_report_enabled })}
              style={{ width: 40, height: 22, borderRadius: 999, border: 'none', background: form.monthly_report_enabled ? C.green : C.border, position: 'relative', cursor: isAdmin ? 'pointer' : 'default' }}>
              <span style={{ position: 'absolute', top: 2, left: form.monthly_report_enabled ? 19 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </button>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>Report email(s) — comma separated</div>
            <input value={form.report_emails_raw} disabled={!isAdmin} onChange={(e) => setForm({ ...form, report_emails_raw: e.target.value })} placeholder="ops@company.com" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <div style={labelStyle}>Route distance (miles)</div>
              <input type="number" step="0.1" value={form.route_distance_miles} disabled={!isAdmin} onChange={(e) => setForm({ ...form, route_distance_miles: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Energy per mile (kWh)</div>
              <input type="number" step="0.1" value={form.energy_per_mile_kwh} disabled={!isAdmin} onChange={(e) => setForm({ ...form, energy_per_mile_kwh: e.target.value })} style={inputStyle} />
            </div>
          </div>
          {isAdmin && (
            <button onClick={save} disabled={saving} style={{ padding: '9px 22px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save Settings'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FuelLog() {
  const profile = useProfile();
  const role = profile?.role;
  const isAdmin = role === 'admin' || role === 'operator';

  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [v, t, s, set] = await Promise.all([
        api.getFuelVehicles().catch(() => []),
        api.getTripLogs({ limit: 200 }).catch(() => []),
        api.getFuelStats().catch(() => null),
        api.getFuelSettings().catch(() => null),
      ]);
      setVehicles(v);
      setTrips(t);
      setStats(s);
      setSettings(set);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteTrip(id) {
    if (!confirm('Delete this trip entry?')) return;
    try {
      await api.deleteTripLog(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  // ── Test mode: generate 20 demo trips ──────────────────────────────────────
  async function generateDemo() {
    const emvs = vehicles.filter((v) => v.type === 'emv');
    if (!emvs.length) { alert('No EMV vehicles found. Run the migration seed first.'); return; }
    setGenerating(true);
    try {
      for (let i = 0; i < 20; i++) {
        const vehicle = emvs[i % emvs.length];
        const isOut = i % 2 === 0;
        const daysAgo = Math.floor((i / 20) * 30);
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        const driver = DRIVERS[i % DRIVERS.length];
        const start = isOut ? 85 + Math.floor(Math.random() * 10) : 45 + Math.floor(Math.random() * 15);
        const drop = 13 + Math.floor(Math.random() * 5);
        const end = Math.max(0, start - drop);
        await api.createTripLog({
          vehicle_id: vehicle.id,
          driver_name: driver,
          trip_date: d.toISOString().slice(0, 10),
          direction: isOut ? 'outbound' : 'return',
          start_soc_pct: start,
          end_soc_pct: end,
          notes: 'Demo entry (Test Mode)',
        });
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

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Fuel &amp; Mileage Log</h1>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>EMV fleet trip + energy tracking</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={toggleTestMode} disabled={generating}
            style={{ padding: '8px 16px', background: testMode ? '#a855f722' : C.panel, border: `1px solid ${testMode ? C.purple : C.border}`, borderRadius: 8, color: testMode ? C.purple : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {generating ? 'Generating…' : 'Test Mode'}
          </button>
          <button onClick={() => setShowForm((s) => !s)}
            style={{ padding: '8px 18px', background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Log Trip
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard label="Trip Legs (Month)" value={stats?.total_trips ?? '—'} accent={C.text} />
        <StatCard label="Total Miles (Month)" value={stats ? fmt(stats.total_miles) : '—'} accent={C.blue} />
        <StatCard label="Energy Used kWh (Month)" value={stats ? fmt(stats.total_energy_kwh) : '—'} accent={C.green} />
        <StatCard label="Avg Efficiency kWh/mi" value={stats ? fmt(stats.avg_efficiency_kwh_per_mile, 2) : '—'} accent={C.amber} />
      </div>

      {/* Route info card */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 22px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{settings?.warehouse_address || ROUTE.warehouse}</span>
          <span style={{ color: C.green, fontWeight: 700 }}>↔</span>
          <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{settings?.customer_address || ROUTE.customer}</span>
          <span style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginLeft: 'auto' }}>{fmt(settings?.route_distance_miles ?? ROUTE.distance)} mi one way</span>
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12, color: C.muted }}>
          <span><strong style={{ color: C.text }}>~{fmt(settings?.energy_per_mile_kwh ?? ROUTE.energyPerMile, 1)} kWh/mile</strong> consumption</span>
          <span><strong style={{ color: C.text }}>~31 kWh</strong> per leg</span>
          <span>Vehicle weight: <strong style={{ color: C.text }}>36,000 lbs</strong></span>
          <span>~96 mi range at 100% SoC (≈1% per mile)</span>
        </div>
      </div>

      {/* Trip form */}
      {showForm && vehicles.length > 0 && (
        <TripForm
          vehicles={vehicles}
          settings={settings}
          defaultDriver={profile?.full_name || ''}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}

      {/* Trip table */}
      {loading ? (
        <div style={{ color: C.muted, padding: 40 }}>Loading trips…</div>
      ) : trips.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: C.muted }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No trips logged yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Click "Log Trip" to add the first one, or enable Test Mode for demo data.</div>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', background: C.panel }}>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                  <th style={{ padding: '10px 12px' }}>Vehicle</th>
                  <th style={{ padding: '10px 12px' }}>Driver</th>
                  <th style={{ padding: '10px 12px' }}>Direction</th>
                  <th style={{ padding: '10px 12px' }}>Start %</th>
                  <th style={{ padding: '10px 12px' }}>End %</th>
                  <th style={{ padding: '10px 12px' }}>Miles</th>
                  <th style={{ padding: '10px 12px' }}>Energy</th>
                  <th style={{ padding: '10px 12px' }}>Eff.</th>
                  <th style={{ padding: '10px 12px' }}>Notes</th>
                  <th style={{ padding: '10px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id} style={{ borderTop: `1px solid ${C.border}`, color: C.text }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{t.trip_date}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.unit_id || '—'}</td>
                    <td style={{ padding: '10px 12px', color: C.muted }}>{t.driver_name || '—'}</td>
                    <td style={{ padding: '10px 12px' }}><DirectionBadge direction={t.direction} /></td>
                    <td style={{ padding: '10px 12px', color: C.muted }}>{t.start_soc_pct != null ? `${fmt(t.start_soc_pct, 0)}%` : '—'}</td>
                    <td style={{ padding: '10px 12px', color: C.muted }}>{t.end_soc_pct != null ? `${fmt(t.end_soc_pct, 0)}%` : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>{fmt(t.distance_miles)}</td>
                    <td style={{ padding: '10px 12px', color: C.green }}>{fmt(t.energy_used_kwh)} kWh</td>
                    <td style={{ padding: '10px 12px', color: C.amber }}>{fmt(t.efficiency_kwh_per_mile, 2)}</td>
                    <td style={{ padding: '10px 12px', color: C.muted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <button onClick={() => deleteTrip(t.id)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 12, cursor: 'pointer' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fleet + Settings */}
      <FleetSection vehicles={vehicles} isAdmin={isAdmin} onChanged={load} />
      <SettingsSection settings={settings} isAdmin={isAdmin} onSaved={load} />
    </div>
  );
}
