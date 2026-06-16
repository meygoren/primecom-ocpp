import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ── CSS animations injected once ─────────────────────────────────────────────

const ANIM_STYLES = `
  @keyframes chargePulse {
    0%, 100% { box-shadow: 0 0 8px var(--c-a), inset 0 0 6px var(--c-d); }
    50%       { box-shadow: 0 0 24px var(--c), 0 0 48px var(--c-b), inset 0 0 18px var(--c-d); }
  }
  @keyframes cableFlow {
    from { stroke-dashoffset: 24; }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes shimmer {
    0%   { opacity: 0.0; transform: translateY(0); }
    50%  { opacity: 0.5; transform: translateY(-10px); }
    100% { opacity: 0.0; transform: translateY(-20px); }
  }
`;

// ── Colour helpers ────────────────────────────────────────────────────────────

function socColor(soc) {
  if (soc === null || soc === undefined) return '#6b7280';
  if (soc >= 80) return '#47a141';
  if (soc >= 20) return '#3b82f6';
  return '#f59e0b';
}

// ── Time-to-full helpers ──────────────────────────────────────────────────────
// The server returns eta_minutes from a blended predictor (observed charge rate
// + historical session data + physics). When it's not available (e.g. test
// mode), fall back to a client-side physics estimate: remaining kWh out of the
// 450 kWh pack divided by current charging power, with throttling above 88%.

function clientPhysicsEta(soc, kw) {
  if (soc == null || soc >= 100 || !kw || kw <= 0) return null;
  const TAPER_START = 88;
  let minutes = 0;
  if (soc < TAPER_START) {
    minutes += ((((TAPER_START - soc) / 100) * 450) / kw) * 60;
  }
  const taperFrom = Math.max(soc, TAPER_START);
  if (taperFrom < 100) {
    minutes += ((((100 - taperFrom) / 100) * 450) / (kw * 0.65)) * 60;
  }
  return Math.round(minutes);
}

function formatEta(minutes) {
  if (minutes == null) return null;
  if (minutes < 1) return { big: '<1', unit: 'min' };
  if (minutes < 60) return { big: `${Math.round(minutes)}`, unit: 'min' };
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return { big: `${h}h ${m}m`, unit: '' };
}

function formatRelTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
// One side of the truck. Fixed width, tall. Label above, then terminal cap,
// then battery body: kW speed at top → SOC % center → kWh stored at bottom.

function BatteryPack({ soc, charging, kw, label, sessionKwh }) {
  const color  = socColor(soc);
  const pct    = soc != null ? Math.min(100, Math.max(0, soc)) : null;
  const noData = pct === null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {/* Side label */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: '#8892a4',
        textTransform: 'uppercase',
        letterSpacing: '.07em',
      }}>
        {label}
      </div>

      {/* Terminal cap */}
      <div style={{
        width: 28,
        height: 7,
        background: '#3a4060',
        borderRadius: '4px 4px 0 0',
      }} />

      {/* Battery body */}
      <div
        style={{
          width: 100,
          height: 180,
          background: '#0f1117',
          border: `3px solid ${noData ? '#2e3347' : color}`,
          borderRadius: 6,
          overflow: 'hidden',
          position: 'relative',
          '--c':   color,
          '--c-a': color + 'aa',
          '--c-b': color + '55',
          '--c-d': color + '33',
          ...(charging && !noData ? { animation: 'chargePulse 2s ease-in-out infinite' } : {}),
        }}
      >
        {/* SOC fill from bottom */}
        {!noData && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${pct}%`,
            background: `linear-gradient(to top, ${color}, ${color}99)`,
            transition: 'height 0.9s ease',
          }} />
        )}

        {/* Shimmer sweep when charging */}
        {charging && !noData && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 50,
            background: `linear-gradient(to top, transparent, ${color}55)`,
            animation: 'shimmer 1.8s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
        )}

        {/* Text overlay: kW top / SOC center / kWh bottom */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 8px',
          zIndex: 1,
        }}>
          {/* Charging speed at top */}
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: kw > 0 ? '#93c5fd' : '#4b5563',
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {kw > 0 ? `${kw.toFixed(0)} kW` : '— kW'}
          </div>

          {/* SOC percentage center */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span style={{
              fontSize: 28,
              fontWeight: 800,
              color: '#fff',
              textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {noData ? '—' : `${Math.round(pct)}%`}
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '.10em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.6)',
              textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            }}>
              State of Charge
            </span>
          </div>

          {/* kWh charged this session at bottom */}
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: noData ? '#4b5563' : 'rgba(255,255,255,0.75)',
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {sessionKwh != null ? `${sessionKwh.toFixed(1)} kWh` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EtaPanel ──────────────────────────────────────────────────────────────────
// Predicted time until 100%, shown beside each battery inside the truck.

function EtaPanel({ etaMinutes, confidence, charging, soc }) {
  const isFull = soc != null && soc >= 100;
  const eta = formatEta(etaMinutes);
  const active = charging && eta !== null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minWidth: 76,
      padding: '8px 6px',
    }}>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.08em',
        color: '#8892a4',
        textAlign: 'center',
        lineHeight: 1.4,
      }}>
        Time to<br />Full
      </div>

      {isFull ? (
        <div style={{ fontSize: 16, fontWeight: 800, color: '#47a141' }}>Full</div>
      ) : active ? (
        <>
          <div style={{
            fontSize: eta.unit ? 26 : 19,
            fontWeight: 800,
            color: '#3b82f6',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'center',
          }}>
            {eta.big}
          </div>
          {eta.unit && (
            <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f688', textTransform: 'uppercase', letterSpacing: '.07em' }}>
              {eta.unit}
            </div>
          )}
          {confidence && (
            <div style={{
              fontSize: 8,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              color: confidence === 'high' ? '#47a141' : confidence === 'medium' ? '#f59e0b' : '#6b7280',
              border: `1px solid ${confidence === 'high' ? '#47a14144' : confidence === 'medium' ? '#f59e0b44' : '#2e3347'}`,
              borderRadius: 999,
              padding: '1px 6px',
              marginTop: 2,
            }}>
              {confidence === 'high' ? 'High conf' : confidence === 'medium' ? 'Med conf' : 'Estimate'}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 16, fontWeight: 700, color: '#4b5563' }}>—</div>
      )}
    </div>
  );
}

// ── TruckTopDown ──────────────────────────────────────────────────────────────
// Class-8 truck viewed from above. Back (rear doors) at top, front at bottom.
// Left rectangle = P-side (passenger), Right rectangle = D-side (driver).

function TruckTopDown({ pSoc, dSoc, pCharging, dCharging, pKw, dKw, pEta, dEta, pConf, dConf, emptyBay, truckLabel, pSessionKwh, dSessionKwh }) {
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
        justifyContent: 'center',
        gap: 14,
        transition: 'background 0.4s, border-color 0.4s',
      }}>
        {/* Passenger side: battery + predicted time to full */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <BatteryPack soc={pSoc} charging={pCharging} kw={pKw} label="Passenger" sessionKwh={pSessionKwh} />
          <EtaPanel etaMinutes={pEta} confidence={pConf} charging={pCharging} soc={pSoc} />
        </div>

        {/* Center structural beam */}
        <div style={{ width: 8, background: '#2a2e40', borderRadius: 4, alignSelf: 'stretch' }} />

        {/* Driver side: battery + predicted time to full */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <BatteryPack soc={dSoc} charging={dCharging} kw={dKw} label="Driver" sessionKwh={dSessionKwh} />
          <EtaPanel etaMinutes={dEta} confidence={dConf} charging={dCharging} soc={dSoc} />
        </div>
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

        {/* Windshield — shows truck number when assigned */}
        <div style={{
          height: truckLabel ? 34 : 20,
          background: '#0f1117',
          border: `1px solid ${truckLabel ? '#47a14166' : '#2e3347'}`,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {truckLabel && (
            <span style={{
              color: '#47a141',
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '.08em',
              textShadow: '0 0 8px #47a14188',
            }}>
              {truckLabel}
            </span>
          )}
        </div>
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

  const pActive   = charger1?.live?.is_active || false;
  const dActive   = charger2?.live?.is_active || false;
  const anyActive = pActive || dActive;

  // Live SoC only shown during an active session
  const pSoc      = pActive ? (charger1?.live?.soc ?? null) : null;
  const dSoc      = dActive ? (charger2?.live?.soc ?? null) : null;
  const pCharging = pActive;
  const dCharging = dActive;
  const pKw       = charger1?.live?.power_kw || 0;
  const dKw       = charger2?.live?.power_kw || 0;

  // kWh charged this session
  const pSessionKwh = charger1?.live?.session_kwh_charged ?? null;
  const dSessionKwh = charger2?.live?.session_kwh_charged ?? null;

  // Last known SoC (persists after session ends, for idle display)
  const pLastSoc   = charger1?.live?.last_soc ?? null;
  const dLastSoc   = charger2?.live?.last_soc ?? null;
  const lastSocTime = charger1?.live?.last_soc_time || charger2?.live?.last_soc_time || null;

  const emptyBay        = !anyActive;
  const showLastSession = !anyActive && (pLastSoc !== null || dLastSoc !== null);

  // Server-blended prediction first; client physics estimate as fallback
  const pEta  = charger1?.live?.eta_minutes ?? clientPhysicsEta(pSoc, pKw);
  const dEta  = charger2?.live?.eta_minutes ?? clientPhysicsEta(dSoc, dKw);
  const pConf = charger1?.live?.eta_minutes != null ? charger1.live.eta_confidence : (pEta != null ? 'low' : null);
  const dConf = charger2?.live?.eta_minutes != null ? charger2.live.eta_confidence : (dEta != null ? 'low' : null);

  // Truck label: either charger in this bay may carry it
  const truckLabel = charger1?.current_truck_label || charger2?.current_truck_label || null;

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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{label}</span>
        {truckLabel && (
          <span style={{ fontSize: 16, fontWeight: 800, color: '#47a141', letterSpacing: '.06em' }}>
            {truckLabel}
          </span>
        )}
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
          pEta={pEta} dEta={dEta}
          pConf={pConf} dConf={dConf}
          emptyBay={emptyBay}
          truckLabel={truckLabel}
          pSessionKwh={pSessionKwh}
          dSessionKwh={dSessionKwh}
        />

        {/* Last session info — shown when idle but SoC data is available */}
        {showLastSession && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: '#0f111788', borderRadius: 8, border: '1px dashed #2e3347' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Last Session
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {pLastSoc !== null && (
                <span style={{ fontSize: 12, color: '#8892a4' }}>
                  P-Side: <span style={{ color: socColor(pLastSoc), fontWeight: 700 }}>{Math.round(pLastSoc)}%</span>
                </span>
              )}
              {dLastSoc !== null && (
                <span style={{ fontSize: 12, color: '#8892a4' }}>
                  D-Side: <span style={{ color: socColor(dLastSoc), fontWeight: 700 }}>{Math.round(dLastSoc)}%</span>
                </span>
              )}
              {lastSocTime && (
                <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>
                  {formatRelTime(lastSocTime)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WarehouseSettingsPanel ────────────────────────────────────────────────────

const TRUCK_NUMBERS = [1, 2, 3, 4, 5, 6];

function WarehouseSettingsPanel({ chargers, truckProfiles, onSaved }) {
  const [forms, setForms]         = useState({});
  const [saving, setSaving]       = useState(null);
  const [saved, setSaved]         = useState(null);
  const [truckForms, setTruckForms] = useState({});
  const [truckSaving, setTruckSaving] = useState(null);
  const [truckSaved, setTruckSaved]   = useState(null);
  const [bayA, setBayA]           = useState('');
  const [bayB, setBayB]           = useState('');
  const [bayAssigning, setBayAssigning] = useState(null);
  const [vinResult, setVinResult] = useState({});
  const [vinLoading, setVinLoading] = useState({});

  // Bay A / Bay B current truck labels from live charger data
  const bayASlots = chargers.filter((c) => c.slot <= 2);
  const bayBSlots = chargers.filter((c) => c.slot > 2);
  const currentBayA = bayASlots[0]?.current_truck_label || '';
  const currentBayB = bayBSlots[0]?.current_truck_label || '';

  // Charger slot forms
  useEffect(() => {
    const init = {};
    chargers.forEach((c) => { init[c.id] = { label: c.label || '', ocpp_id: c.ocpp_id || '' }; });
    setForms(init);
  }, [chargers]);

  // Truck profile forms — one row per truck number 1-6
  useEffect(() => {
    const init = {};
    TRUCK_NUMBERS.forEach((n) => {
      const existing = truckProfiles.find((p) => p.truck_number === n);
      init[n] = {
        label: existing?.label || `TRUCK ${n}`,
        passenger_mac: existing?.passenger_mac || '',
        driver_mac: existing?.driver_mac || '',
      };
    });
    setTruckForms(init);
  }, [truckProfiles]);

  // Bay assignment labels default to current data
  useEffect(() => {
    setBayA(currentBayA);
    setBayB(currentBayB);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBayA, currentBayB]);

  function setSlotField(id, field, value) {
    setForms((f) => ({ ...f, [id]: { ...f[id], [field]: value } }));
  }

  async function saveSlot(c) {
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

  function setTruckField(n, field, value) {
    setTruckForms((f) => ({ ...f, [n]: { ...f[n], [field]: value } }));
  }

  async function saveTruckProfile(n) {
    setTruckSaving(n);
    try {
      await api.saveTruckProfile({
        truck_number: n,
        label: truckForms[n]?.label || `TRUCK ${n}`,
        passenger_mac: truckForms[n]?.passenger_mac || null,
        driver_mac: truckForms[n]?.driver_mac || null,
      });
      setTruckSaved(n);
      setTimeout(() => setTruckSaved(null), 2000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setTruckSaving(null);
    }
  }

  async function assignBayTruck(bay, label) {
    setBayAssigning(bay);
    try {
      await api.setBayTruck(bay, label || null);
      if (onSaved) onSaved();
    } catch (err) {
      alert('Assign failed: ' + err.message);
    } finally {
      setBayAssigning(null);
    }
  }

  async function transferVin(ocppId, slotKey) {
    if (!ocppId) return alert('No OCPP ID configured for this slot');
    setVinLoading((v) => ({ ...v, [slotKey]: true }));
    setVinResult((v) => ({ ...v, [slotKey]: null }));
    try {
      const res = await api.transferVin(ocppId);
      const msg = res?.result?.data || res?.result?.status || JSON.stringify(res?.result);
      setVinResult((v) => ({ ...v, [slotKey]: { ok: true, msg } }));
    } catch (err) {
      setVinResult((v) => ({ ...v, [slotKey]: { ok: false, msg: err.message } }));
    } finally {
      setVinLoading((v) => ({ ...v, [slotKey]: false }));
    }
  }

  const inp = { background: '#0f1117', border: '1px solid #2e3347', borderRadius: 6, padding: '7px 10px', color: '#f1f5f9', fontSize: 12, width: '100%', boxSizing: 'border-box', outline: 'none' };
  const sectionHdr = { fontWeight: 700, fontSize: 13, color: '#f1f5f9', marginBottom: 4 };
  const sectionSub = { fontSize: 12, color: '#8892a4', marginBottom: 16, marginTop: 2 };

  // Truck label options for bay assignment dropdown
  const truckOptions = TRUCK_NUMBERS.map((n) => ({
    value: truckForms[n]?.label || `TRUCK ${n}`,
    label: truckForms[n]?.label || `TRUCK ${n}`,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 28 }}>

      {/* ── Bay Assignment ──────────────────────────────────────────────────── */}
      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: '#22263a', borderBottom: '1px solid #2e3347', padding: '14px 20px' }}>
          <div style={sectionHdr}>Bay Assignment</div>
          <div style={sectionSub}>Select which truck is currently in each bay. Updates the truck number displayed on screen.</div>
        </div>
        <div style={{ padding: 20, display: 'flex', gap: 20 }}>
          {[{ bay: 'A', value: bayA, setter: setBayA, slots: bayASlots },
            { bay: 'B', value: bayB, setter: setBayB, slots: bayBSlots }].map(({ bay, value, setter, slots }) => {
            const charger1 = slots[0];
            const charger2 = slots[1];
            const ocppIds = [charger1?.ocpp_id, charger2?.ocpp_id].filter(Boolean);
            return (
              <div key={bay} style={{ flex: 1, background: '#22263a', border: '1px solid #2e3347', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>Bay {bay}</div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4 }}>Truck in Bay</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      style={{ ...inp, flex: 1 }}
                    >
                      <option value="">— Empty bay —</option>
                      {truckOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => assignBayTruck(bay, value)}
                      disabled={bayAssigning === bay}
                      style={{ background: '#47a141', border: 'none', borderRadius: 7, padding: '7px 14px', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {bayAssigning === bay ? 'Saving...' : 'Set'}
                    </button>
                  </div>
                </div>
                {/* Transfer VIN buttons */}
                <div style={{ fontSize: 10, color: '#8892a4', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Transfer VIN</div>
                {ocppIds.length === 0 && <div style={{ fontSize: 11, color: '#4b5563' }}>No chargers configured</div>}
                {ocppIds.map((ocppId, i) => {
                  const key = `${bay}-${i}`;
                  return (
                    <div key={ocppId} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#6b7280', flex: 1, fontFamily: 'monospace' }}>{ocppId}</span>
                        <button
                          onClick={() => transferVin(ocppId, key)}
                          disabled={vinLoading[key]}
                          style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 6, padding: '4px 10px', color: '#8892a4', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {vinLoading[key] ? 'Sending...' : 'Transfer VIN'}
                        </button>
                      </div>
                      {vinResult[key] && (
                        <div style={{ fontSize: 11, marginTop: 4, color: vinResult[key].ok ? '#47a141' : '#ef4444', wordBreak: 'break-all' }}>
                          {vinResult[key].msg}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Truck Profiles ──────────────────────────────────────────────────── */}
      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: '#22263a', borderBottom: '1px solid #2e3347', padding: '14px 20px' }}>
          <div style={sectionHdr}>Truck Profiles</div>
          <div style={sectionSub}>
            Set the Passenger and Driver MAC addresses for each truck. When a charging session starts with a matching MAC, the truck is automatically identified in the bay.
          </div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {TRUCK_NUMBERS.map((n) => (
              <div key={n} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 }}>Truck {n}</div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4 }}>Display Label</label>
                  <input style={inp} value={truckForms[n]?.label || ''} onChange={(e) => setTruckField(n, 'label', e.target.value)} placeholder={`TRUCK ${n}`} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4 }}>Passenger MAC Address</label>
                  <input style={inp} value={truckForms[n]?.passenger_mac || ''} onChange={(e) => setTruckField(n, 'passenger_mac', e.target.value)} placeholder="e.g. AA:BB:CC:DD:EE:FF" />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4 }}>Driver MAC Address</label>
                  <input style={inp} value={truckForms[n]?.driver_mac || ''} onChange={(e) => setTruckField(n, 'driver_mac', e.target.value)} placeholder="e.g. AA:BB:CC:DD:EE:FF" />
                </div>
                <button
                  onClick={() => saveTruckProfile(n)}
                  disabled={truckSaving === n}
                  style={{ background: truckSaved === n ? '#2d5c2a' : '#47a141', border: 'none', borderRadius: 7, padding: '7px 16px', color: '#fff', fontWeight: 700, fontSize: 12, cursor: truckSaving === n ? 'wait' : 'pointer', width: '100%' }}
                >
                  {truckSaving === n ? 'Saving...' : truckSaved === n ? 'Saved' : 'Save'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Charger Slot Configuration ──────────────────────────────────────── */}
      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: '#22263a', borderBottom: '1px solid #2e3347', padding: '14px 20px' }}>
          <div style={sectionHdr}>Warehouse Charger Configuration</div>
          <div style={sectionSub}>Assign OCPP IDs to warehouse charging slots</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {chargers.map((c) => (
              <div key={c.id} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 }}>Slot {c.slot} — {c.label || 'Charger'}</div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4 }}>Label</label>
                  <input style={inp} value={forms[c.id]?.label || ''} onChange={(e) => setSlotField(c.id, 'label', e.target.value)} placeholder={`Charger ${c.slot}`} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4 }}>OCPP ID</label>
                  <input style={inp} value={forms[c.id]?.ocpp_id || ''} onChange={(e) => setSlotField(c.id, 'ocpp_id', e.target.value)} placeholder="e.g. WH-CHARGER-01" />
                </div>
                <button onClick={() => saveSlot(c)} disabled={saving === c.id} style={{ background: saved === c.id ? '#2d5c2a' : '#47a141', border: 'none', borderRadius: 7, padding: '7px 16px', color: '#fff', fontWeight: 700, fontSize: 12, cursor: saving === c.id ? 'wait' : 'pointer', width: '100%' }}>
                  {saving === c.id ? 'Saving...' : saved === c.id ? 'Saved' : 'Save'}
                </button>
              </div>
            ))}
          </div>
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
      is_active: true,
      power_kw: 308 + Math.sin(t + phase) * 8 + Math.cos(t * 1.6 + phase) * 4,
      soc: Math.min(98, Math.max(5, baseSoc + Math.sin(t * 0.12 + phase) * 4)),
      session_kwh_charged: Math.max(0, 12 + Math.sin(t * 0.08 + phase) * 5),
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

  const [chargers, setChargers]           = useState([]);
  const [truckProfiles, setTruckProfiles] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [testMode, setTestMode]           = useState(false);
  const [demoTick, setDemoTick]           = useState(0);

  const load = useCallback(async () => {
    try {
      const [data, profiles] = await Promise.all([
        api.getWarehouseChargers(),
        api.getTruckProfiles().catch(() => []),
      ]);
      setChargers(data);
      setTruckProfiles(profiles);
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
            <WarehouseSettingsPanel chargers={chargers} truckProfiles={truckProfiles} onSaved={load} />
          )}
        </>
      )}
    </div>
  );
}
