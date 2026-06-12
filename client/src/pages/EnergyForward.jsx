import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ─── helpers ──────────────────────────────────────────────────────────────────

function chargerStatus(charger) {
  return charger?.live?.status || 'offline';
}

function isCharging(charger) {
  return ['charging', 'online'].includes(chargerStatus(charger));
}

// ─── ConnectorLines ───────────────────────────────────────────────────────────

function ConnectorLines({ leftActive, rightActive }) {
  const lc = leftActive  ? '#3b82f6' : '#2e3347';
  const rc = rightActive ? '#3b82f6' : '#2e3347';
  const mc = (leftActive || rightActive) ? '#3b82f6' : '#2e3347';
  return (
    <svg width="100%" height="48" style={{ display: 'block', overflow: 'visible' }}>
      <line x1="25%" y1="0" x2="25%" y2="24" stroke={lc} strokeWidth="2" />
      <line x1="75%" y1="0" x2="75%" y2="24" stroke={rc} strokeWidth="2" />
      <line x1="25%" y1="24" x2="50%" y2="24" stroke={lc} strokeWidth="2" />
      <line x1="75%" y1="24" x2="50%" y2="24" stroke={rc} strokeWidth="2" />
      <line x1="50%" y1="24" x2="50%" y2="48" stroke={mc} strokeWidth="2" />
    </svg>
  );
}

// ─── ChargerUnit ──────────────────────────────────────────────────────────────

function ChargerUnit({ charger, sideLabel }) {
  if (!charger) return null;
  const active   = isCharging(charger);
  const status   = chargerStatus(charger);
  const soc      = charger.live?.soc;
  const powerKw  = charger.live?.power_kw;
  const conns    = charger.live?.connectors || [];
  const configured = !!charger.ocpp_id;

  const borderColor = active ? '#3b82f644' : '#2e3347';
  const glowStyle   = active ? { boxShadow: '0 0 0 2px #3b82f633' } : {};

  return (
    <div style={{
      background: '#1a1d27',
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      padding: '14px 16px',
      minWidth: 170,
      flex: 1,
      ...glowStyle,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{charger.label || `Charger ${charger.slot}`}</div>
          <div style={{ fontSize: 10, color: '#8892a4', marginTop: 1 }}>→ {sideLabel}</div>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#3b82f6' : status === 'offline' ? '#6b7280' : '#47a141', flexShrink: 0 }} />
      </div>

      {!configured ? (
        <div style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>Not configured</div>
      ) : (
        <>
          <div style={{ fontSize: 10, color: '#8892a4', marginBottom: 8 }}>320 kW AC/DC</div>
          {conns.map((c) => {
            const cPower = active && powerKw ? (powerKw / conns.filter((x) => x.active).length || powerKw / 2) : null;
            return (
              <div key={c.connector_id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.active ? '#3b82f6' : '#2e3347', border: `1px solid ${c.active ? '#3b82f6' : '#2e3347'}`, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#8892a4', minWidth: 52 }}>Cable {c.cable}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: c.active ? '#3b82f6' : '#6b7280' }}>
                  {c.active && cPower ? `${cPower.toFixed(0)} kW` : '—'}
                </span>
              </div>
            );
          })}
          {powerKw != null && powerKw > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #2e3347', fontSize: 11, color: '#3b82f6', fontWeight: 700 }}>
              {powerKw.toFixed(1)} kW total
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── BatteryBar (vertical) ───────────────────────────────────────────────────

function BatteryBar({ soc, charging }) {
  const color = soc == null ? '#6b7280' : soc >= 80 ? '#47a141' : soc >= 20 ? '#3b82f6' : '#f59e0b';
  const pct   = Math.min(soc ?? 0, 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {/* Battery body */}
      <div style={{ width: 36, height: 80, border: `2px solid ${color}`, borderRadius: 6, padding: 3, position: 'relative', background: '#0f1117' }}>
        {/* Battery terminal at top */}
        <div style={{ width: 12, height: 4, background: color, borderRadius: '2px 2px 0 0', position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)' }} />
        {/* Fill */}
        <div style={{
          position: 'absolute',
          bottom: 3, left: 3, right: 3,
          height: `${pct}%`,
          background: color,
          borderRadius: 3,
          transition: 'height 0.6s ease',
          opacity: charging ? 0.9 : 0.7,
        }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: soc != null ? color : '#6b7280' }}>
        {soc != null ? `${Math.round(soc)}%` : '—'}
      </span>
      {charging && <div style={{ fontSize: 9, color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Charging</div>}
    </div>
  );
}

// ─── TruckDock ────────────────────────────────────────────────────────────────

function TruckDock({ pCharger, dCharger }) {
  const pSoc      = pCharger?.live?.soc;
  const dSoc      = dCharger?.live?.soc;
  const pCharging = isCharging(pCharger);
  const dCharging = isCharging(dCharger);
  const anyActive = pCharging || dCharging;

  return (
    <div style={{
      background: '#1a1d27',
      border: `1px solid ${anyActive ? '#3b82f644' : '#2e3347'}`,
      borderRadius: 12,
      padding: '18px 24px',
      minWidth: 360,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14, textAlign: 'center' }}>
        Cargo Bay — Energy Storage
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 0, alignItems: 'center' }}>
        {/* P side */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingRight: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.06em' }}>Passenger</div>
          <BatteryBar soc={pSoc} charging={pCharging} />
          {pCharger?.live?.power_kw != null && pCharger.live.power_kw > 0 && (
            <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>{pCharger.live.power_kw.toFixed(1)} kW</div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: '#2e3347', alignSelf: 'stretch' }} />

        {/* D side */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingLeft: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.06em' }}>Driver</div>
          <BatteryBar soc={dSoc} charging={dCharging} />
          {dCharger?.live?.power_kw != null && dCharger.live.power_kw > 0 && (
            <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>{dCharger.live.power_kw.toFixed(1)} kW</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bay ──────────────────────────────────────────────────────────────────────

function Bay({ title, chargerA, chargerB }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>{title}</div>

      {/* Two charger units */}
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 400 }}>
        <ChargerUnit charger={chargerA} sideLabel="P-Side" />
        <ChargerUnit charger={chargerB} sideLabel="D-Side" />
      </div>

      {/* SVG connector lines */}
      <div style={{ width: '100%', maxWidth: 400 }}>
        <ConnectorLines leftActive={isCharging(chargerA)} rightActive={isCharging(chargerB)} />
      </div>

      {/* Truck dock */}
      <TruckDock pCharger={chargerA} dCharger={chargerB} />
    </div>
  );
}

// ─── DriverView (simplified) ──────────────────────────────────────────────────

function DriverView({ chargers }) {
  const [c1, c2, c3, c4] = chargers;
  return (
    <div style={{ padding: '32px 36px', maxWidth: 700 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>Energy Forward — Warehouse</h1>
      <div style={{ fontSize: 13, color: '#8892a4', marginBottom: 28 }}>Current charge status</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {[{ title: 'Bay A (Left)', pC: c1, dC: c2 }, { title: 'Bay B (Right)', pC: c3, dC: c4 }].map(({ title, pC, dC }) => (
          <div key={title} style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>{title}</div>
            <TruckDock pCharger={pC} dCharger={dC} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── WarehouseSettings ────────────────────────────────────────────────────────

function WarehouseSettings({ chargers, onRefresh }) {
  const [open, setOpen]     = useState(false);
  const [forms, setForms]   = useState({});
  const [saving, setSaving] = useState(null);

  function openForm(c) {
    setForms((p) => ({ ...p, [c.id]: { label: c.label || '', ocpp_id: c.ocpp_id || '' } }));
  }

  async function save(c) {
    setSaving(c.id);
    try {
      await api.updateWarehouseCharger(c.id, forms[c.id]);
      await onRefresh();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(null);
    }
  }

  const inp = { background: '#22263a', border: '1px solid #2e3347', borderRadius: 6, padding: '7px 10px', color: '#f1f5f9', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden', marginTop: 24 }}>
      <div onClick={() => { setOpen(!open); if (!open) chargers.forEach(openForm); }} style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
          <Settings size={14} color="#8892a4" /> Warehouse Charger OCPP IDs
        </div>
        {open ? <ChevronUp size={14} color="#8892a4" /> : <ChevronDown size={14} color="#8892a4" />}
      </div>
      {open && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid #2e3347' }}>
          <div style={{ paddingTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {chargers.map((c) => (
              <div key={c.id}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', marginBottom: 8 }}>{c.label || `Charger ${c.slot}`}</div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: '#8892a4', marginBottom: 3 }}>Label</div>
                  <input style={inp} value={forms[c.id]?.label ?? c.label ?? ''} onChange={(e) => setForms((p) => ({ ...p, [c.id]: { ...p[c.id], label: e.target.value } }))} placeholder={`Charger ${c.slot}`} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#8892a4', marginBottom: 3 }}>OCPP ID</div>
                  <input style={inp} value={forms[c.id]?.ocpp_id ?? c.ocpp_id ?? ''} onChange={(e) => setForms((p) => ({ ...p, [c.id]: { ...p[c.id], ocpp_id: e.target.value } }))} placeholder="e.g. EF-CHARGER-1" />
                </div>
                <button
                  onClick={() => save(c)}
                  disabled={saving === c.id}
                  style={{ width: '100%', background: saving === c.id ? '#22263a' : '#47a141', border: 'none', borderRadius: 6, padding: '7px 0', color: saving === c.id ? '#8892a4' : '#fff', fontWeight: 700, fontSize: 11, cursor: saving === c.id ? 'not-allowed' : 'pointer' }}
                >
                  {saving === c.id ? 'Saving...' : 'Save'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EnergyForward() {
  const [chargers, setChargers]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [lastUpdated, setLast]    = useState(null);
  const profile = useProfile();
  const isAdmin = profile?.role === 'admin';
  const isDriver = profile?.role === 'driver';

  const load = useCallback(async () => {
    try {
      const data = await api.getWarehouseChargers();
      setChargers(data);
      setLast(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <div style={{ padding: '32px 36px', color: '#8892a4' }}>Loading warehouse data...</div>;

  const [c1, c2, c3, c4] = chargers;
  const totalKw = chargers.reduce((s, c) => s + (c.live?.power_kw || 0), 0);
  const activeBays = [c1, c2].some(isCharging) + [c3, c4].some(isCharging);

  if (isDriver) return <DriverView chargers={chargers} />;

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Energy Forward</h1>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Warehouse recharging bay · {activeBays} bay{activeBays !== 1 ? 's' : ''} active · {totalKw.toFixed(1)} kW total</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastUpdated && <span style={{ fontSize: 11, color: '#8892a4' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button onClick={load} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '7px 12px', color: '#8892a4', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#3f1515', border: '1px solid #ef4444', borderRadius: 8, padding: '12px 16px', color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {/* Warehouse floor plan */}
      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 16, padding: '32px 40px' }}>
        <div style={{ fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600, textAlign: 'center', marginBottom: 28 }}>
          Warehouse Floor Plan — Top View
        </div>

        <div style={{ display: 'flex', gap: 40, justifyContent: 'center', alignItems: 'flex-start' }}>
          <Bay title="Bay A — Left Parking" chargerA={c1} chargerB={c2} />

          {/* Bay divider */}
          <div style={{ width: 1, background: '#2e3347', alignSelf: 'stretch', margin: '0 8px' }} />

          <Bay title="Bay B — Right Parking" chargerA={c3} chargerB={c4} />
        </div>

        {/* Legend */}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #2e3347', display: 'flex', gap: 20, justifyContent: 'center' }}>
          {[
            { color: '#3b82f6', label: 'Active charging' },
            { color: '#47a141', label: 'Online / ready' },
            { color: '#6b7280', label: 'Offline' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 11, color: '#8892a4' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Admin settings */}
      {isAdmin && <WarehouseSettings chargers={chargers} onRefresh={load} />}
    </div>
  );
}
