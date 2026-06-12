import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ── CSS animations injected once ─────────────────────────────────────────────

const ANIM_STYLES = `
  @keyframes chargePulse {
    0%, 100% { box-shadow: 0 0 8px var(--c), inset 0 0 6px var(--c-dim); }
    50%       { box-shadow: 0 0 20px var(--c), inset 0 0 14px var(--c-dim); }
  }
  @keyframes cableFlow {
    from { stroke-dashoffset: 24; }
    to   { stroke-dashoffset: 0; }
  }
`;

// ── Colour helpers ────────────────────────────────────────────────────────────

function socColor(soc) {
  if (soc === null || soc === undefined) return '#6b7280';
  if (soc >= 80) return '#47a141';
  if (soc >= 20) return '#3b82f6';
  return '#f59e0b';
}

// ── CableSVG ─────────────────────────────────────────────────────────────────
// Draws two vertical cable lines from the charger pair down to the truck sides.

function CableSVG({ leftActive, rightActive }) {
  const lc = leftActive  ? '#3b82f6' : '#2e3347';
  const rc = rightActive ? '#3b82f6' : '#2e3347';
  return (
    <svg width="100%" height="40" style={{ display: 'block', overflow: 'visible' }}>
      {/* Left line → P-side */}
      <line
        x1="27%" y1="0" x2="27%" y2="40"
        stroke={lc} strokeWidth={leftActive ? 2 : 1.5}
        strokeDasharray={leftActive ? '6 4' : 'none'}
        style={leftActive ? { animation: 'cableFlow 0.6s linear infinite' } : {}}
      />
      {/* Right line → D-side */}
      <line
        x1="73%" y1="0" x2="73%" y2="40"
        stroke={rc} strokeWidth={rightActive ? 2 : 1.5}
        strokeDasharray={rightActive ? '6 4' : 'none'}
        style={rightActive ? { animation: 'cableFlow 0.6s linear infinite' } : {}}
      />
    </svg>
  );
}

// ── BatteryPack ───────────────────────────────────────────────────────────────
// One side of the truck — a tall rectangle with SOC fill from the bottom.

function BatteryPack({ soc, charging, kw, label }) {
  const color  = socColor(soc);
  const pct    = soc != null ? Math.min(100, Math.max(0, soc)) : null;
  const noData = pct === null;

  const dimColor = color + '44';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {/* Side label */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.07em' }}>
        {label}
      </div>

      {/* Battery rectangle */}
      <div
        style={{
          width: '100%',
          height: 130,
          background: '#0f1117',
          border: `2px solid ${noData ? '#2e3347' : color}`,
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
          // CSS custom props for animation
          '--c':     color,
          '--c-dim': dimColor,
          ...(charging && !noData ? { animation: 'chargePulse 2s ease-in-out infinite' } : {}),
        }}
      >
        {/* Fill level */}
        {!noData && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${pct}%`,
            background: `linear-gradient(to top, ${color}, ${color}99)`,
            transition: 'height 0.8s ease',
          }} />
        )}

        {/* SOC number */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          zIndex: 1,
        }}>
          <span style={{
            fontSize: 22,
            fontWeight: 700,
            color: !noData && pct > 45 ? '#fff' : noData ? '#4b5563' : color,
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            lineHeight: 1,
          }}>
            {noData ? '—' : `${Math.round(pct)}%`}
          </span>
          {kw > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
              {kw.toFixed(0)} kW
            </span>
          )}
        </div>
      </div>

      {/* Charging indicator */}
      {charging && (
        <div style={{ fontSize: 9, color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          ● Charging
        </div>
      )}
    </div>
  );
}

// ── TruckTopDown ──────────────────────────────────────────────────────────────
// Class-8 truck viewed from above. Back (rear doors) at top, front at bottom.
// Left rectangle = P-side (passenger), Right rectangle = D-side (driver).

function TruckTopDown({ pSoc, dSoc, pCharging, dCharging, pKw, dKw, emptyBay }) {
  const anyCharging = pCharging || dCharging;
  const bodyColor   = anyCharging ? '#1e2a3a' : '#1e2535';
  const borderColor = anyCharging ? '#3b82f666' : '#3a4060';

  if (emptyBay) {
    return (
      <div style={{
        border: '2px dashed #2e3347',
        borderRadius: 12,
        padding: '36px 20px',
        textAlign: 'center',
        color: '#4b5563',
        fontSize: 13,
      }}>
        Empty Bay
      </div>
    );
  }

  return (
    <div style={{ width: '100%', userSelect: 'none' }}>
      {/* Rear coupling / hitch bar */}
      <div style={{
        marginLeft: '5%', marginRight: '5%',
        height: 8,
        background: '#3a4060',
        borderRadius: '6px 6px 0 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ width: 30, height: 4, background: '#2e3347', borderRadius: 2 }} />
      </div>

      {/* Trailer body */}
      <div style={{
        marginLeft: '5%', marginRight: '5%',
        background: bodyColor,
        border: `2px solid ${borderColor}`,
        borderTop: 'none',
        borderBottom: 'none',
        padding: '14px 10px',
        display: 'flex',
        gap: 10,
        transition: 'background 0.4s, border-color 0.4s',
      }}>
        {/* P-Side (passenger) */}
        <BatteryPack soc={pSoc} charging={pCharging} kw={pKw} label="P-Side" />

        {/* Center structural beam */}
        <div style={{ width: 8, background: '#2a2e40', borderRadius: 4, flexShrink: 0 }} />

        {/* D-Side (driver) */}
        <BatteryPack soc={dSoc} charging={dCharging} kw={dKw} label="D-Side" />
      </div>

      {/* Trailer → cab transition */}
      <div style={{
        marginLeft: '5%', marginRight: '5%',
        height: 10,
        background: '#2a2e40',
        borderLeft: `2px solid ${borderColor}`,
        borderRight: `2px solid ${borderColor}`,
      }} />

      {/* Cab body */}
      <div style={{
        marginLeft: '14%', marginRight: '14%',
        background: '#22263a',
        border: `2px solid ${borderColor}`,
        borderBottom: 'none',
        borderRadius: '6px 6px 0 0',
        padding: '8px 10px',
        position: 'relative',
      }}>
        {/* Side mirrors */}
        <div style={{ position: 'absolute', left: -9, top: 6, width: 9, height: 14, background: '#3a4060', borderRadius: '3px 0 0 3px' }} />
        <div style={{ position: 'absolute', right: -9, top: 6, width: 9, height: 14, background: '#3a4060', borderRadius: '0 3px 3px 0' }} />

        {/* Windshield */}
        <div style={{
          height: 20,
          background: '#0f1117',
          border: '1px solid #2e3347',
          borderRadius: 4,
          opacity: 0.8,
        }} />
      </div>

      {/* Front bumper / grille */}
      <div style={{
        marginLeft: '14%', marginRight: '14%',
        height: 10,
        background: '#3a4060',
        borderRadius: '0 0 6px 6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ width: 3, height: 6, background: '#2e3347', borderRadius: 1 }} />
        ))}
      </div>
    </div>
  );
}

// ── ChargerUnit ───────────────────────────────────────────────────────────────

function ChargerUnit({ charger }) {
  if (!charger) return null;

  const live       = charger.live;
  const configured = !!charger.ocpp_id;
  const isCharging = live?.status === 'charging';
  const isOnline   = live?.status === 'online' || live?.status === 'available' || isCharging;
  const cableA     = live?.connectors?.[0];
  const cableB     = live?.connectors?.[1];
  const totalKw    = live?.power_kw != null ? live.power_kw.toFixed(1) : null;
  const dotColor   = isCharging ? '#3b82f6' : isOnline ? '#47a141' : '#6b7280';

  return (
    <div style={{
      background: '#1a1d27',
      border: isCharging ? '1px solid #3b82f644' : '1px solid #2e3347',
      borderRadius: 10,
      padding: '14px 16px',
      flex: 1,
      minWidth: 0,
      boxShadow: isCharging ? '0 0 0 2px #3b82f622' : 'none',
      ...(configured ? {} : { borderStyle: 'dashed', borderColor: '#2e3347' }),
    }}>
      {!configured ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7280', fontSize: 12 }}>
          <div style={{ fontSize: 20, marginBottom: 6, color: '#2e3347' }}>—</div>
          Not configured
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>
              {charger.label || `Charger ${charger.slot}`}
            </div>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: `0 0 5px ${dotColor}88`, display: 'inline-block' }} />
          </div>
          <div style={{ fontSize: 10, color: '#8892a4', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            320 kW AC/DC
          </div>
          {[{ label: 'Cable A', connector: cableA }, { label: 'Cable B', connector: cableB }].map(({ label, connector }) => {
            const active = connector?.active;
            return (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '5px 8px', borderRadius: 6,
                background: active ? '#1a2540' : '#0f1117',
                border: `1px solid ${active ? '#3b82f644' : '#2e3347'}`,
                marginBottom: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#3b82f6' : '#6b7280', display: 'inline-block' }} />
                  <span style={{ fontSize: 11, color: active ? '#f1f5f9' : '#6b7280' }}>{label}</span>
                </div>
                {active && totalKw !== null && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6' }}>
                    {(parseFloat(totalKw) / 2).toFixed(0)} kW
                  </span>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── BayView ───────────────────────────────────────────────────────────────────

function BayView({ label, charger1, charger2 }) {
  const left1Active  = charger1?.live?.connectors?.[0]?.active || false;
  const left2Active  = charger1?.live?.connectors?.[1]?.active || false;
  const right1Active = charger2?.live?.connectors?.[0]?.active || false;
  const right2Active = charger2?.live?.connectors?.[1]?.active || false;
  const leftActive   = left1Active  || left2Active;
  const rightActive  = right1Active || right2Active;

  const pSoc      = charger1?.live?.soc ?? null;
  const dSoc      = charger2?.live?.soc ?? null;
  const pCharging = charger1?.live?.status === 'charging';
  const dCharging = charger2?.live?.status === 'charging';
  const pKw       = charger1?.live?.power_kw || 0;
  const dKw       = charger2?.live?.power_kw || 0;
  const emptyBay  = pSoc === null && dSoc === null && !pCharging && !dCharging;

  return (
    <div style={{
      flex: 1,
      background: '#1a1d27',
      border: '1px solid #2e3347',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Bay header */}
      <div style={{
        background: '#22263a',
        borderBottom: '1px solid #2e3347',
        padding: '12px 18px',
        fontSize: 13,
        fontWeight: 700,
        color: '#f1f5f9',
      }}>
        {label}
      </div>

      <div style={{ padding: 16 }}>
        {/* Charger row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 0 }}>
          <ChargerUnit charger={charger1} />
          <ChargerUnit charger={charger2} />
        </div>

        {/* Cable lines from chargers down to truck */}
        <CableSVG leftActive={leftActive} rightActive={rightActive} />

        {/* Top-down truck */}
        <TruckTopDown
          pSoc={pSoc} dSoc={dSoc}
          pCharging={pCharging} dCharging={dCharging}
          pKw={pKw} dKw={dKw}
          emptyBay={emptyBay}
        />
      </div>
    </div>
  );
}

// ── WarehouseSettingsPanel ────────────────────────────────────────────────────

function WarehouseSettingsPanel({ chargers, onSaved }) {
  const [forms, setForms] = useState({});
  const [saving, setSaving] = useState(null);
  const [saved, setSaved]   = useState(null);

  useEffect(() => {
    const init = {};
    chargers.forEach((c) => { init[c.id] = { label: c.label || '', ocpp_id: c.ocpp_id || '' }; });
    setForms(init);
  }, [chargers]);

  function setField(id, field, value) {
    setForms((f) => ({ ...f, [id]: { ...f[id], [field]: value } }));
  }

  async function save(c) {
    setSaving(c.id);
    try {
      await api.updateWarehouseCharger(c.id, { label: forms[c.id]?.label || null, ocpp_id: forms[c.id]?.ocpp_id || null });
      setSaved(c.id);
      setTimeout(() => setSaved(null), 2000);
      if (onSaved) onSaved();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(null);
    }
  }

  const inp = { background: '#0f1117', border: '1px solid #2e3347', borderRadius: 6, padding: '7px 10px', color: '#f1f5f9', fontSize: 12, width: '100%', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden', marginTop: 28 }}>
      <div style={{ background: '#22263a', borderBottom: '1px solid #2e3347', padding: '14px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>Warehouse Charger Configuration</div>
        <div style={{ fontSize: 12, color: '#8892a4', marginTop: 3 }}>Assign OCPP IDs to warehouse charging slots</div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {chargers.map((c) => (
            <div key={c.id} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 }}>Slot {c.slot} — {c.label || 'Charger'}</div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4 }}>Label</label>
                <input style={inp} value={forms[c.id]?.label || ''} onChange={(e) => setField(c.id, 'label', e.target.value)} placeholder={`Charger ${c.slot}`} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4 }}>OCPP ID</label>
                <input style={inp} value={forms[c.id]?.ocpp_id || ''} onChange={(e) => setField(c.id, 'ocpp_id', e.target.value)} placeholder="e.g. WH-CHARGER-01" />
              </div>
              <button onClick={() => save(c)} disabled={saving === c.id} style={{ background: saved === c.id ? '#2d5c2a' : '#47a141', border: 'none', borderRadius: 7, padding: '7px 16px', color: '#fff', fontWeight: 700, fontSize: 12, cursor: saving === c.id ? 'wait' : 'pointer', width: '100%' }}>
                {saving === c.id ? 'Saving...' : saved === c.id ? 'Saved' : 'Save'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Driver view ───────────────────────────────────────────────────────────────

function DriverView({ chargers }) {
  const bayA = chargers.filter((c) => c.slot <= 2).sort((a, b) => a.slot - b.slot);
  const bayB = chargers.filter((c) => c.slot > 2).sort((a, b) => a.slot - b.slot);

  function BayStrip({ label, charger1, charger2 }) {
    const pSoc  = charger1?.live?.soc ?? null;
    const dSoc  = charger2?.live?.soc ?? null;
    const pKw   = charger1?.live?.power_kw || 0;
    const dKw   = charger2?.live?.power_kw || 0;
    const totalKw = pKw + dKw;

    function BigSoc({ soc, sideLabel }) {
      const pct   = soc !== null && soc !== undefined ? Math.min(100, Math.max(0, soc)) : 0;
      const color = socColor(soc);
      const noData = soc === null || soc === undefined;
      return (
        <div style={{ flex: 1, textAlign: 'center', padding: '20px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#8892a4', marginBottom: 12 }}>{sideLabel}</div>
          <div style={{ fontSize: 44, fontWeight: 700, color: noData ? '#6b7280' : color, lineHeight: 1.1 }}>{noData ? '—' : `${Math.round(pct)}%`}</div>
          {!noData && (
            <div style={{ height: 8, borderRadius: 4, background: '#22263a', margin: '12px auto 0', maxWidth: 120, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden', flex: 1 }}>
        <div style={{ background: '#22263a', borderBottom: '1px solid #2e3347', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{label}</span>
          {totalKw > 0 && <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>{totalKw.toFixed(0)} kW total</span>}
        </div>
        <div style={{ display: 'flex' }}>
          <BigSoc soc={pSoc} sideLabel="P-Side" />
          <div style={{ width: 1, background: '#2e3347', margin: '10px 0' }} />
          <BigSoc soc={dSoc} sideLabel="D-Side" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Energy Forward</h1>
        <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Warehouse charging status</div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <BayStrip label="Bay A" charger1={bayA[0]} charger2={bayA[1]} />
        <BayStrip label="Bay B" charger1={bayB[0]} charger2={bayB[1]} />
      </div>
    </div>
  );
}

// ── Demo data generator ───────────────────────────────────────────────────────

const DEMO_SLOTS = [
  { slot: 1, label: 'Charger A1', baseSoc: 72, phase: 0.0 },
  { slot: 2, label: 'Charger A2', baseSoc: 85, phase: 1.5 },
  { slot: 3, label: 'Charger B1', baseSoc: 55, phase: 0.8 },
  { slot: 4, label: 'Charger B2', baseSoc: 38, phase: 2.2 },
];

function getDemoChargers(tick) {
  const t = tick * 0.45;
  return DEMO_SLOTS.map(({ slot, label, baseSoc, phase }) => ({
    id: `demo-${slot}`,
    slot,
    ocpp_id: `DEMO-WH-0${slot}`,
    label,
    live: {
      status: 'charging',
      power_kw: 308 + Math.sin(t + phase) * 8 + Math.cos(t * 1.6 + phase) * 4,
      soc: Math.min(98, Math.max(5, baseSoc + Math.sin(t * 0.12 + phase) * 4)),
      connectors: [
        { connector_id: 1, active: true },
        { connector_id: 2, active: true },
      ],
    },
  }));
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EnergyForward() {
  const profile   = useProfile();
  const isAdmin   = profile?.role === 'admin';
  const isDriver  = profile?.role === 'driver';

  const [chargers, setChargers]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testMode, setTestMode]         = useState(false);
  const [demoTick, setDemoTick]         = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await api.getWarehouseChargers();
      setChargers(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  // Tick demo data every 1.8 s when test mode is on
  useEffect(() => {
    if (!testMode) return;
    const iv = setInterval(() => setDemoTick((t) => t + 1), 1800);
    return () => clearInterval(iv);
  }, [testMode]);

  if (isDriver) {
    return loading ? (
      <div style={{ padding: '32px 36px', color: '#8892a4' }}>Loading...</div>
    ) : (
      <DriverView chargers={chargers} />
    );
  }

  const displayChargers = testMode ? getDemoChargers(demoTick) : chargers;
  const sorted   = [...displayChargers].sort((a, b) => a.slot - b.slot);
  const bayA     = sorted.filter((c) => c.slot <= 2);
  const bayB     = sorted.filter((c) => c.slot > 2);
  const charger1 = bayA[0] || null;
  const charger2 = bayA[1] || null;
  const charger3 = bayB[0] || null;
  const charger4 = bayB[1] || null;

  const activeChargers = displayChargers.filter((c) => c.live?.status === 'charging').length;
  const totalKw        = displayChargers.reduce((sum, c) => sum + (c.live?.power_kw || 0), 0);

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1280 }}>
      {/* Inject animation keyframes */}
      <style>{ANIM_STYLES}</style>

      {/* Test mode banner */}
      {testMode && (
        <div style={{ background: '#2a1f00', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: '#f59e0b', color: '#000', fontWeight: 800, fontSize: 10, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>Test Mode</span>
          <span style={{ fontSize: 12, color: '#fbbf24' }}>Simulated data — all values are fake. Real charger data is paused.</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Energy Forward</h1>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>
            Energy Forward LLC · Recharging bay · refreshes every 30 s
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Test mode toggle */}
          <button
            onClick={() => { setTestMode((m) => !m); setDemoTick(0); }}
            style={{
              background: testMode ? '#2a1f00' : '#22263a',
              border: `1px solid ${testMode ? '#f59e0b' : '#2e3347'}`,
              borderRadius: 7,
              padding: '7px 14px',
              color: testMode ? '#f59e0b' : '#8892a4',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: testMode ? '#f59e0b' : '#4b5563', display: 'inline-block', boxShadow: testMode ? '0 0 6px #f59e0b' : 'none' }} />
            {testMode ? 'Test Mode ON' : 'Test Mode'}
          </button>
          {isAdmin && (
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              style={{ background: settingsOpen ? '#2d5c2a33' : '#22263a', border: `1px solid ${settingsOpen ? '#47a141' : '#2e3347'}`, borderRadius: 7, padding: '7px 14px', color: settingsOpen ? '#47a141' : '#8892a4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {settingsOpen ? 'Hide Settings' : 'Settings'}
            </button>
          )}
        </div>
      </div>

      {loading && <div style={{ color: '#8892a4', padding: 40 }}>Loading warehouse data...</div>}
      {error && (
        <div style={{ color: '#ef4444', background: '#1a1d27', border: '1px solid #ef444444', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
            <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '18px 22px' }}>
              <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 6 }}>Warehouse Chargers</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>{chargers.length}</div>
            </div>
            <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '18px 22px' }}>
              <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 6 }}>Active Chargers</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>{activeChargers}</div>
            </div>
            <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '18px 22px' }}>
              <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 6 }}>Total Output</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{totalKw.toFixed(0)} kW</div>
            </div>
          </div>

          {/* Warehouse visualization */}
          <div style={{ display: 'flex', gap: 20 }}>
            <BayView label="Bay A" charger1={charger1} charger2={charger2} />
            <div style={{ width: 1, background: '#2e3347', margin: '0 4px', flexShrink: 0 }} />
            <BayView label="Bay B" charger1={charger3} charger2={charger4} />
          </div>

          {isAdmin && settingsOpen && (
            <WarehouseSettingsPanel chargers={chargers} onSaved={load} />
          )}
        </>
      )}
    </div>
  );
}
