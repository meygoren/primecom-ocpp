import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ── Colour helpers ────────────────────────────────────────────────────────────

function socColor(soc) {
  if (soc === null || soc === undefined) return '#6b7280';
  if (soc >= 80) return '#47a141';
  if (soc >= 20) return '#3b82f6';
  return '#f59e0b';
}

// ── ConnectorLines SVG ────────────────────────────────────────────────────────

function ConnectorLines({ leftActive, rightActive }) {
  const lColor = leftActive ? '#3b82f6' : '#2e3347';
  const rColor = rightActive ? '#3b82f6' : '#2e3347';
  const trunkColor = leftActive || rightActive ? '#3b82f6' : '#2e3347';
  return (
    <svg width="100%" height="48" style={{ display: 'block' }}>
      <line x1="25%" y1="0" x2="25%" y2="24" stroke={lColor} strokeWidth="2" />
      <line x1="75%" y1="0" x2="75%" y2="24" stroke={rColor} strokeWidth="2" />
      <line x1="25%" y1="24" x2="50%" y2="24" stroke={lColor} strokeWidth="2" />
      <line x1="75%" y1="24" x2="50%" y2="24" stroke={rColor} strokeWidth="2" />
      <line x1="50%" y1="24" x2="50%" y2="48" stroke={trunkColor} strokeWidth="2" />
    </svg>
  );
}

// ── ChargerUnit ───────────────────────────────────────────────────────────────

function ChargerUnit({ charger }) {
  if (!charger) return null;

  const live = charger.live;
  const configured = !!charger.ocpp_id;
  const isCharging = live?.status === 'charging';
  const isOnline = live?.status === 'online' || live?.status === 'available' || isCharging;

  const cableA = live?.connectors?.[0];
  const cableB = live?.connectors?.[1];
  const totalKw = live?.power_kw != null ? live.power_kw.toFixed(1) : null;

  const statusDotColor = isCharging ? '#3b82f6' : isOnline ? '#47a141' : '#6b7280';

  return (
    <div
      style={{
        background: '#1a1d27',
        border: isCharging ? '1px solid #3b82f644' : '1px solid #2e3347',
        borderRadius: 10,
        padding: '14px 16px',
        flex: 1,
        minWidth: 0,
        boxShadow: isCharging ? '0 0 0 2px #3b82f622' : 'none',
        ...(configured ? {} : { borderStyle: 'dashed', borderColor: '#2e3347' }),
      }}
    >
      {!configured ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7280', fontSize: 12 }}>
          <div style={{ fontSize: 20, marginBottom: 6, color: '#2e3347' }}>—</div>
          Not configured
        </div>
      ) : (
        <>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>
              {charger.label || `Charger ${charger.slot}`}
            </div>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusDotColor,
                boxShadow: `0 0 5px ${statusDotColor}88`,
              }}
            />
          </div>

          <div style={{ fontSize: 10, color: '#8892a4', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            320 kW AC/DC
          </div>

          {/* Cables */}
          {[
            { label: 'Cable A', connector: cableA },
            { label: 'Cable B', connector: cableB },
          ].map(({ label, connector }) => {
            const active = connector?.active;
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  borderRadius: 6,
                  background: active ? '#1a2540' : '#0f1117',
                  border: `1px solid ${active ? '#3b82f644' : '#2e3347'}`,
                  marginBottom: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: active ? '#3b82f6' : '#6b7280',
                      display: 'inline-block',
                    }}
                  />
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

// ── BatteryVisual ─────────────────────────────────────────────────────────────

function BatteryVisual({ soc, charging }) {
  const pct = soc !== null && soc !== undefined ? Math.min(100, Math.max(0, soc)) : 0;
  const color = socColor(soc);
  const noData = soc === null || soc === undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {/* Battery body */}
      <div style={{ position: 'relative', width: 36, height: 80 }}>
        {/* Battery terminal cap */}
        <div
          style={{
            width: 14,
            height: 5,
            background: '#2e3347',
            borderRadius: '3px 3px 0 0',
            margin: '0 auto',
          }}
        />
        {/* Battery casing */}
        <div
          style={{
            width: 36,
            height: 72,
            border: `2px solid ${noData ? '#2e3347' : color}`,
            borderRadius: 5,
            overflow: 'hidden',
            position: 'relative',
            background: '#0f1117',
          }}
        >
          {/* Fill */}
          {!noData && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: `${pct}%`,
                background: color,
                opacity: 0.85,
                transition: 'height 0.6s ease',
              }}
            />
          )}
          {/* Charging pulse overlay */}
          {charging && !noData && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(to top, transparent, ${color}22)`,
                animation: 'pulse 2s ease-in-out infinite',
              }}
            />
          )}
        </div>
      </div>

      {/* SOC label */}
      <div style={{ fontSize: 15, fontWeight: 700, color: noData ? '#6b7280' : color }}>
        {noData ? '—' : `${Math.round(pct)}%`}
      </div>

      {charging && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: '#3b82f6',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.06em',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#3b82f6',
              display: 'inline-block',
            }}
          />
          Charging
        </div>
      )}
    </div>
  );
}

// ── TruckDock ─────────────────────────────────────────────────────────────────

function TruckDock({ pSoc, dSoc, pCharging, dCharging, pKw, dKw }) {
  const hasTruck = pSoc !== null || dSoc !== null || pCharging || dCharging;

  return (
    <div
      style={{
        background: '#1a1d27',
        border: hasTruck ? '1px solid #2e3347' : '2px dashed #2e3347',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {!hasTruck ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: 13,
          }}
        >
          Empty Bay
        </div>
      ) : (
        <>
          <div
            style={{
              background: '#22263a',
              borderBottom: '1px solid #2e3347',
              padding: '8px 16px',
              fontSize: 10,
              fontWeight: 700,
              color: '#8892a4',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            Cargo Bay
          </div>
          <div style={{ display: 'flex', padding: '20px 16px', gap: 0 }}>
            {/* Passenger side */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                  color: '#8892a4',
                }}
              >
                Passenger
              </div>
              <BatteryVisual soc={pSoc} charging={pCharging} />
              {pKw > 0 && (
                <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>
                  {pKw.toFixed(0)} kW
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: '#2e3347', margin: '0 8px' }} />

            {/* Driver side */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                  color: '#8892a4',
                }}
              >
                Driver
              </div>
              <BatteryVisual soc={dSoc} charging={dCharging} />
              {dKw > 0 && (
                <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>
                  {dKw.toFixed(0)} kW
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── BayView ───────────────────────────────────────────────────────────────────

function BayView({ label, charger1, charger2 }) {
  // Determine active state for SVG lines
  const left1Active = charger1?.live?.connectors?.[0]?.active || false;
  const left2Active = charger1?.live?.connectors?.[1]?.active || false;
  const right1Active = charger2?.live?.connectors?.[0]?.active || false;
  const right2Active = charger2?.live?.connectors?.[1]?.active || false;
  const leftBayActive = left1Active || left2Active;
  const rightBayActive = right1Active || right2Active;

  // For the truck dock: P-side comes from charger1, D-side from charger2
  const pSoc = charger1?.live?.soc ?? null;
  const dSoc = charger2?.live?.soc ?? null;
  const pCharging = charger1?.live?.status === 'charging';
  const dCharging = charger2?.live?.status === 'charging';
  const pKw = charger1?.live?.power_kw || 0;
  const dKw = charger2?.live?.power_kw || 0;

  return (
    <div
      style={{
        flex: 1,
        background: '#1a1d27',
        border: '1px solid #2e3347',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {/* Bay header */}
      <div
        style={{
          background: '#22263a',
          borderBottom: '1px solid #2e3347',
          padding: '12px 18px',
          fontSize: 13,
          fontWeight: 700,
          color: '#f1f5f9',
        }}
      >
        {label}
      </div>

      <div style={{ padding: 16 }}>
        {/* Charger row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 0 }}>
          <ChargerUnit charger={charger1} />
          <ChargerUnit charger={charger2} />
        </div>

        {/* Connection lines */}
        <ConnectorLines leftActive={leftBayActive} rightActive={rightBayActive} />

        {/* Truck dock */}
        <TruckDock
          pSoc={pSoc}
          dSoc={dSoc}
          pCharging={pCharging}
          dCharging={dCharging}
          pKw={pKw}
          dKw={dKw}
        />
      </div>
    </div>
  );
}

// ── WarehouseSettingsPanel ────────────────────────────────────────────────────

function WarehouseSettingsPanel({ chargers, onSaved }) {
  const [forms, setForms] = useState({});
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    const init = {};
    chargers.forEach((c) => {
      init[c.id] = { label: c.label || '', ocpp_id: c.ocpp_id || '' };
    });
    setForms(init);
  }, [chargers]);

  function setField(id, field, value) {
    setForms((f) => ({ ...f, [id]: { ...f[id], [field]: value } }));
  }

  async function save(c) {
    setSaving(c.id);
    try {
      await api.updateWarehouseCharger(c.id, {
        label: forms[c.id]?.label || null,
        ocpp_id: forms[c.id]?.ocpp_id || null,
      });
      setSaved(c.id);
      setTimeout(() => setSaved(null), 2000);
      if (onSaved) onSaved();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(null);
    }
  }

  const inp = {
    background: '#0f1117',
    border: '1px solid #2e3347',
    borderRadius: 6,
    padding: '7px 10px',
    color: '#f1f5f9',
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <div
      style={{
        background: '#1a1d27',
        border: '1px solid #2e3347',
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: 28,
      }}
    >
      <div style={{ background: '#22263a', borderBottom: '1px solid #2e3347', padding: '14px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>Warehouse Charger Configuration</div>
        <div style={{ fontSize: 12, color: '#8892a4', marginTop: 3 }}>
          Assign OCPP IDs to warehouse charging slots
        </div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {chargers.map((c) => (
            <div
              key={c.id}
              style={{
                background: '#22263a',
                border: '1px solid #2e3347',
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 }}>
                Slot {c.slot} — {c.label || 'Charger'}
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4 }}>Label</label>
                <input
                  style={inp}
                  value={forms[c.id]?.label || ''}
                  onChange={(e) => setField(c.id, 'label', e.target.value)}
                  placeholder={`Charger ${c.slot}`}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4 }}>OCPP ID</label>
                <input
                  style={inp}
                  value={forms[c.id]?.ocpp_id || ''}
                  onChange={(e) => setField(c.id, 'ocpp_id', e.target.value)}
                  placeholder="e.g. WH-CHARGER-01"
                />
              </div>
              <button
                onClick={() => save(c)}
                disabled={saving === c.id}
                style={{
                  background: saved === c.id ? '#2d5c2a' : '#47a141',
                  border: 'none',
                  borderRadius: 7,
                  padding: '7px 16px',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: saving === c.id ? 'wait' : 'pointer',
                  width: '100%',
                }}
              >
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
  // Bay A = slots 1-2, Bay B = slots 3-4
  const bayA = chargers.filter((c) => c.slot <= 2).sort((a, b) => a.slot - b.slot);
  const bayB = chargers.filter((c) => c.slot > 2).sort((a, b) => a.slot - b.slot);

  function BayStrip({ label, charger1, charger2 }) {
    const pSoc = charger1?.live?.soc ?? null;
    const dSoc = charger2?.live?.soc ?? null;
    const pKw = charger1?.live?.power_kw || 0;
    const dKw = charger2?.live?.power_kw || 0;
    const totalKw = pKw + dKw;

    function BigSoc({ soc, sideLabel }) {
      const pct = soc !== null && soc !== undefined ? Math.min(100, Math.max(0, soc)) : 0;
      const color = socColor(soc);
      const noData = soc === null || soc === undefined;
      return (
        <div style={{ flex: 1, textAlign: 'center', padding: '20px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#8892a4', marginBottom: 12 }}>
            {sideLabel}
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, color: noData ? '#6b7280' : color, lineHeight: 1.1 }}>
            {noData ? '—' : `${Math.round(pct)}%`}
          </div>
          {!noData && (
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: '#22263a',
                margin: '12px auto 0',
                maxWidth: 120,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 4,
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden', flex: 1 }}>
        <div style={{ background: '#22263a', borderBottom: '1px solid #2e3347', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{label}</span>
          {totalKw > 0 && (
            <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>{totalKw.toFixed(0)} kW total</span>
          )}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EnergyForward() {
  const profile = useProfile();
  const isAdmin = profile?.role === 'admin';
  const isDriver = profile?.role === 'driver';

  const [chargers, setChargers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  if (isDriver) {
    return loading ? (
      <div style={{ padding: '32px 36px', color: '#8892a4' }}>Loading...</div>
    ) : (
      <DriverView chargers={chargers} />
    );
  }

  // Bay A = slots 1-2, Bay B = slots 3-4
  const sorted = [...chargers].sort((a, b) => a.slot - b.slot);
  const bayA = sorted.filter((c) => c.slot <= 2);
  const bayB = sorted.filter((c) => c.slot > 2);

  const charger1 = bayA[0] || null;
  const charger2 = bayA[1] || null;
  const charger3 = bayB[0] || null;
  const charger4 = bayB[1] || null;

  // Stats
  const activeChargers = chargers.filter((c) => c.live?.status === 'charging').length;
  const totalKw = chargers.reduce((sum, c) => sum + (c.live?.power_kw || 0), 0);

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1280 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Energy Forward</h1>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>
            Energy Forward LLC · Recharging bay · refreshes every 30 s
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              style={{
                background: settingsOpen ? '#2d5c2a33' : '#22263a',
                border: `1px solid ${settingsOpen ? '#47a141' : '#2e3347'}`,
                borderRadius: 7,
                padding: '7px 14px',
                color: settingsOpen ? '#47a141' : '#8892a4',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {settingsOpen ? 'Hide Settings' : 'Settings'}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ color: '#8892a4', padding: 40 }}>Loading warehouse data...</div>
      )}
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
            <BayView label="Bay A (Left)" charger1={charger1} charger2={charger2} />

            {/* Bay divider */}
            <div
              style={{
                width: 1,
                background: '#2e3347',
                margin: '0 4px',
                flexShrink: 0,
              }}
            />

            <BayView label="Bay B (Right)" charger1={charger3} charger2={charger4} />
          </div>

          {/* Admin settings panel */}
          {isAdmin && settingsOpen && (
            <WarehouseSettingsPanel chargers={chargers} onSaved={load} />
          )}
        </>
      )}
    </div>
  );
}
