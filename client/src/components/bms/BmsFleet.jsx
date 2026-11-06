import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, ArrowLeft, ChevronRight, ChevronDown, Pencil, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useProfile } from '../../contexts/ProfileContext';
import { makeT } from '../../lib/bmsI18n';
import { C, LEVEL, HEAT, heatColor, ReportProvider, fmt, fmtDate, btnStyle, linkBtn, cardStyle, tableStyle, thStyle, tdStyle, rowStyle } from '../../lib/bmsUi';
import { Tile, WarningCounts, Trend } from './BmsSections';


// BMS home, truck and battery-system pages.
//
// 6 trucks, each with two battery systems (driver side and passenger side).
// Each system is recognised by the serial (HWID) in its BMS log; the first
// time a serial is uploaded the page asks which truck and side it is on.
//
// Three levels, each a short summary first with details one click away:
//   BMS home     — fleet numbers + one card per truck (both sides at a glance)
//   Truck page   — driver vs passenger side by side
//   System page  — one battery: its numbers over time, heat map, every log

const enT = makeT('en');
const SIDES = ['driver', 'passenger'];
const SIDE_LABEL = { driver: 'Driver side', passenger: 'Passenger side' };
const PERIODS = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']];
const DEFAULT_LAYOUTS = { driver: [[7, 6, 1], [8, 5, 2], [9, 4, 3]], passenger: [[1, 6, 7], [2, 5, 8], [3, 4, 9]] };

function canEditRole(profile) { return profile?.role === 'admin' || profile?.role === 'operator'; }
function shortId(id) { return id ? `${String(id).slice(0, 6)}…${String(id).slice(-4)}` : '—'; }
function sysLabel(truckName, side) { return `${truckName} · ${SIDE_LABEL[side] || 'side not set'}`; }

// Shared colour scale for every heat grid on a page, so systems compare fairly.
function heatScale(lists) {
  const vals = lists.flat().filter((v) => v != null);
  if (!vals.length) return { lo: 20, hi: 40 };
  const lo = Math.floor(Math.min(...vals));
  const hi = Math.ceil(Math.max(...vals));
  return { lo, hi: hi > lo ? hi : lo + 1 };
}

// --- small pieces ---------------------------------------------------------------

// The pack face as a grid of modules (as seen standing outside the truck),
// coloured by each module's average temperature.
export function MiniPack({ temps, layout, scale, size = 26, side, showLabels }) {
  const grid = layout || DEFAULT_LAYOUTS[side] || DEFAULT_LAYOUTS.driver;
  const all = grid.flat().map((k) => temps?.[k - 1]).filter((v) => v != null);
  const max = all.length ? Math.max(...all) : null;
  const frontRight = side === 'passenger';
  return (
    <div style={{ display: 'inline-block' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${grid[0].length}, ${size}px)`, gap: 3 }}>
        {grid.flatMap((row, r) => row.map((k, c) => {
          const v = temps?.[k - 1] ?? null;
          const hot = v != null && v === max && all.length > 1;
          const pos = `${r + 1}${'abc'[c] || c + 1}`;
          return (
            <div
              key={`${r}-${c}`}
              title={`${pos} · module ${k} · ${v == null ? 'no data' : `${fmt(v, '°C', 1)} average`}`}
              style={{
                width: size, height: size * 0.72, borderRadius: 4, background: v == null ? C.inner : heatColor(v, scale.lo, scale.hi),
                outline: hot ? `2px solid ${C.amber}` : 'none', outlineOffset: -1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: Math.max(9, size / 4.2), color: v != null && (v - scale.lo) / (scale.hi - scale.lo || 1) > 0.6 ? '#1a1d27' : C.text,
              }}
            >
              {showLabels ? (v == null ? pos : fmt(v, '', size >= 40 ? 1 : 0)) : ''}
            </div>
          );
        }))}
      </div>
      {side && (
        <div style={{ fontSize: 10, color: C.muted, marginTop: 3, textAlign: frontRight ? 'right' : 'left' }}>
          {frontRight ? 'front →' : '← front'}
        </div>
      )}
    </div>
  );
}

function HeatLegend({ scale }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted }}>
      {scale.lo}°C
      <span style={{ width: 90, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${HEAT.join(',')})` }} />
      {scale.hi}°C · average module temperature
    </span>
  );
}

function Crumbs({ items }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, marginBottom: 16 }}>
      <ArrowLeft size={14} color={C.green} />
      {items.map(([label, to], i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <ChevronRight size={13} color={C.muted} />}
          {to ? <button onClick={() => navigate(to)} style={linkBtn}>{label}</button> : <span style={{ color: C.muted }}>{label}</span>}
        </span>
      ))}
    </div>
  );
}

function PeriodPicker({ days, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {PERIODS.map(([d, label], i) => (
        <button key={d} onClick={() => onChange(d)} style={{
          background: days === d ? '#2d5c2a55' : C.inner, color: days === d ? C.green : C.muted, border: 'none',
          borderLeft: i ? `1px solid ${C.border}` : 'none', padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>{label}</button>
      ))}
    </div>
  );
}

function Banner({ level, text }) {
  const L = LEVEL[level];
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: `${L.color}1a`, border: `1px solid ${L.color}55`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text, marginBottom: 16 }}>
      <L.Icon size={14} color={L.color} /> {text}
    </div>
  );
}

function Grid({ min = 170, children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 10 }}>{children}</div>;
}

function Warn({ w }) {
  return <ReportProvider value={{ t: enT, lang: 'en', print: false }}><WarningCounts w={w} /></ReportProvider>;
}

// --- assign a serial to a truck + side --------------------------------------------

export function AssignDialog({ hwid, current, trucks, isNew, onClose, onSaved }) {
  const list = trucks?.length ? trucks : [1, 2, 3, 4, 5, 6].map((n) => ({ truck: n, name: `Truck ${n}` }));
  const [truck, setTruck] = useState(current?.truck ?? null);
  const [side, setSide] = useState(current?.side ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const hadOne = current?.truck != null || !!current?.side;
  const ready = (truck != null && !!side) || (truck == null && !side && hadOne);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.setBmsSystem(hwid, { truck, side });
      onSaved(r);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(100%, 460px)', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{isNew ? 'New battery system' : 'Which truck is this battery on?'}</div>
          <button onClick={onClose} style={{ ...linkBtn, color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
          {isNew ? 'This BMS serial has not been seen before. ' : ''}
          Serial <code style={{ color: C.text }}>{hwid}</code>. Choose its truck and side once — later logs from this battery are recognised automatically.
        </div>

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Truck</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
          {list.map((t) => (
            <button key={t.truck} onClick={() => setTruck(t.truck)} style={{ ...btnStyle(truck === t.truck), justifyContent: 'center' }}>{t.name}</button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Side</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {SIDES.map((s) => (
            <button key={s} onClick={() => setSide(s)} style={{ ...btnStyle(side === s), justifyContent: 'center' }}>{SIDE_LABEL[s]}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Driver side = the left of the truck when sitting in the cab.</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button onClick={save} disabled={busy || !ready} style={{ ...btnStyle(true), opacity: ready ? 1 : 0.5 }}>{busy ? 'Saving…' : truck == null && !side && hadOne ? 'Save (not assigned)' : 'Save'}</button>
          <button onClick={onClose} style={btnStyle()}>{isNew ? 'Skip for now' : 'Cancel'}</button>
          {current && (current.truck != null || current.side) && (
            <button onClick={() => { setTruck(null); setSide(null); }} style={{ ...linkBtn, color: C.muted, marginLeft: 'auto' }}>Clear</button>
          )}
        </div>
        {err && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{err}</div>}
      </div>
    </div>
  );
}

// --- upload ------------------------------------------------------------------------

function UploadBox({ trucks, onUploaded }) {
  const navigate = useNavigate();
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [ask, setAsk] = useState([]); // [{ hwid, id }] serials to assign, one dialog at a time
  const [openAfter, setOpenAfter] = useState(null);
  const inputRef = useRef();

  async function uploadFiles(files) {
    const list = [...files].filter((f) => /\.xlsx$/i.test(f.name));
    if (!list.length) {
      setUploads([{ name: 'Upload', status: 'error', message: 'Choose .xlsx files exported from the BMS platform.' }]);
      return;
    }
    setUploads(list.map((f) => ({ name: f.name, status: 'waiting' })));
    const unknown = [];
    let lastId = null;
    for (let k = 0; k < list.length; k++) {
      setUploads((u) => u.map((x, j) => (j === k ? { ...x, status: 'uploading' } : x)));
      try {
        const r = await api.uploadBmsReport(list[k]);
        lastId = r.id;
        const where = r.assignment?.truck != null ? ` · ${sysLabel(`Truck ${r.assignment.truck}`, r.assignment.side)}` : '';
        setUploads((u) => u.map((x, j) => (j === k ? { ...x, status: 'done', id: r.id, message: `${r.duplicate ? 'Already uploaded' : 'Analyzed'}${where}` } : x)));
        if (r.hwid && (!r.assignment || r.assignment.truck == null || !r.assignment.side) && !unknown.some((x) => x.hwid === r.hwid)) unknown.push({ hwid: r.hwid, id: r.id, current: r.assignment });
      } catch (err) {
        setUploads((u) => u.map((x, j) => (j === k ? { ...x, status: 'error', message: err.message } : x)));
      }
    }
    const single = list.length === 1 && lastId ? lastId : null;
    if (unknown.length) {
      setOpenAfter(single);
      setAsk(unknown);
    } else {
      onUploaded();
      if (single) navigate(`/bms/${single}`);
    }
  }

  function nextAsk() {
    const rest = ask.slice(1);
    setAsk(rest);
    if (!rest.length) {
      onUploaded();
      if (openAfter) navigate(`/bms/${openAfter}`);
    }
  }

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          background: dragging ? '#2d5c2a33' : C.card, border: `1.5px dashed ${dragging ? C.green : C.border}`,
          borderRadius: 12, padding: '16px 18px', cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <Upload size={20} color={C.green} style={{ flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Upload BMS logs</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Drop .xlsx files here or click to choose. New batteries are asked for their truck and side once.</div>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx" multiple hidden onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {uploads.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 16, padding: 14 }}>
          {uploads.map((u, k) => (
            <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13, padding: '4px 0', flexWrap: 'wrap' }}>
              <span style={{ color: C.text, fontWeight: 600, wordBreak: 'break-all' }}>{u.name}</span>
              <span style={{ color: u.status === 'error' ? C.red : u.status === 'done' ? C.green : C.muted }}>
                {u.status === 'uploading' ? 'Uploading and analyzing…' : u.status === 'waiting' ? 'Waiting…' : u.message}
              </span>
              {u.id && <button onClick={() => navigate(`/bms/${u.id}`)} style={{ ...linkBtn, marginLeft: 'auto' }}>Open</button>}
            </div>
          ))}
        </div>
      )}

      {ask[0] && (
        <AssignDialog
          key={ask[0].hwid}
          hwid={ask[0].hwid}
          current={ask[0].current}
          trucks={trucks}
          isNew
          onClose={nextAsk}
          onSaved={nextAsk}
        />
      )}
    </>
  );
}

// --- BMS home ----------------------------------------------------------------------

export function FleetHome({ headerButtons, settingsError }) {
  const navigate = useNavigate();
  const profile = useProfile();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [assigning, setAssigning] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getBmsFleet(days)
      .then((r) => { if (!cancelled) { setData(r); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [days, reload]);

  const refresh = () => setReload((n) => n + 1);
  const f = data?.fleet;
  const scale = heatScale((data?.trucks || []).flatMap((t) => SIDES.map((s) => t.sides[s]?.module_temps || [])));
  const where = (x) => (x ? sysLabel(x.name || `Truck ${x.truck}`, x.side) : '');

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>BMS — Trucks</h1>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Each truck has a driver-side and a passenger-side battery. Click a truck to compare its two sides, or a side to see that battery.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <PeriodPicker days={days} onChange={setDays} />
          {headerButtons}
        </div>
      </div>

      {settingsError && <Banner level="critical" text={settingsError} />}
      {error && <Banner level="critical" text={error} />}
      {canEditRole(profile) && <UploadBox trucks={data?.trucks} onUploaded={refresh} />}

      {!data ? (
        <div style={{ color: C.muted, fontSize: 13 }}>{error ? '' : 'Loading…'}</div>
      ) : (
        <>
          {/* Fleet summary */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Fleet — last {days} days</div>
              <div style={{ fontSize: 12, color: C.muted }}>{f.systems_reporting} of {f.systems_assigned} assigned batteries sent logs · {f.logs} logs</div>
            </div>
            <Grid>
              <Tile label="Energy delivered" value={fmt(f.energy_out_kwh, '', 0)} unit="kWh" sub={f.vehicle_charges_est ? `≈ ${fmt(f.vehicle_charges_est, '', 0)} vehicle charges` : 'energy out of all batteries'} accent={C.s2} />
              <Tile label="Usable energy per truck" value={fmt(f.avg_capacity_kwh != null ? f.avg_capacity_kwh * 2 : null, '', 0)} unit="kWh" sub={f.avg_capacity_kwh != null ? `${fmt(f.avg_capacity_kwh, 'kWh', 0)} per side, measured` : 'needs a discharge of 20%+ SOC'} />
              <Tile label="Time to fully discharge" value={fmt(f.avg_full_discharge_hours, '', 1)} unit="h" sub={f.avg_full_discharge_hours != null ? `${fmt((f.avg_full_discharge_hours * 60) / 10, 'min', 0)} per 10% SOC at average load` : 'at the average discharge rate'} />
              <Tile label="Battery health (SOH)" value={fmt(f.median_soh, '', 1)} unit="% median" sub={f.lowest_soh ? `lowest ${fmt(f.lowest_soh.soh, '%')} — ${where(f.lowest_soh)}` : ''} />
              <Tile label="Most cycles" value={fmt(f.most_cycles?.equivalent_full_cycles, '', 0)} unit="cycles" sub={where(f.most_cycles)} />
              <Tile label="Hottest" value={fmt(f.hottest?.max_temp_c, '', 0)} unit="°C" sub={where(f.hottest)} accent={f.hottest?.max_temp_c >= 45 ? C.amber : undefined} />
            </Grid>
          </div>

          {/* Trucks */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '4px 0 10px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Trucks</div>
            <HeatLegend scale={scale} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))', gap: 12, marginBottom: 16 }}>
            {data.trucks.map((t) => (
              <TruckCard key={t.truck} truck={t} scale={scale} layouts={data.layouts} onOpen={() => navigate(`/bms/truck/${t.truck}`)} onOpenSide={(hwid) => navigate(`/bms/system/${encodeURIComponent(hwid)}`)} />
            ))}
          </div>

          {data.unassigned.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: 16, borderColor: `${C.amber}66` }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Batteries not assigned to a truck</div>
              <div style={{ fontSize: 12, color: C.muted, margin: '3px 0 10px' }}>Their logs are stored but not counted in the truck numbers above.</div>
              {data.unassigned.map((u) => (
                <div key={u.hwid} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
                  <code style={{ color: C.text }}>{u.hwid}</code>
                  <span style={{ color: C.muted }}>{u.logs} log{u.logs === 1 ? '' : 's'} · last {fmtDate(u.last_log)}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                    <button onClick={() => navigate(`/bms/system/${encodeURIComponent(u.hwid)}`)} style={{ ...linkBtn, color: C.muted }}>View</button>
                    {canEditRole(profile) && <button onClick={() => setAssigning(u)} style={linkBtn}>Assign truck and side</button>}
                  </span>
                </div>
              ))}
            </div>
          )}

          <AllLogs trucks={data.trucks} />
        </>
      )}

      {assigning && (
        <AssignDialog hwid={assigning.hwid} current={{ truck: null, side: assigning.side }} trucks={data?.trucks} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); refresh(); }} />
      )}
    </>
  );
}

function TruckCard({ truck, scale, layouts, onOpen, onOpenSide }) {
  const tot = truck.totals;
  const any = SIDES.some((s) => truck.sides[s]);
  return (
    <div onClick={onOpen} style={{ ...cardStyle, padding: 14, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{truck.name}</div>
        <div style={{ fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
          {any ? <>{fmt(tot.energy_out_kwh, 'kWh', 0)} out{tot.measured_capacity_kwh != null && <> · {fmt(tot.measured_capacity_kwh, 'kWh', 0)} usable</>}</> : 'No batteries assigned'}
          <ChevronRight size={14} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {SIDES.map((side) => {
          const x = truck.sides[side];
          return (
            <div
              key={side}
              onClick={(e) => { if (x) { e.stopPropagation(); onOpenSide(x.hwid); } }}
              style={{ background: C.inner, borderRadius: 10, padding: 10, minWidth: 0, cursor: x ? 'pointer' : 'default' }}
              title={x ? `Open ${SIDE_LABEL[side].toLowerCase()} battery` : ''}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{SIDE_LABEL[side]}</div>
              {!x ? (
                <div style={{ fontSize: 12, color: C.muted, padding: '10px 0' }}>No battery assigned</div>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <MiniPack temps={x.module_temps} layout={layouts?.[side]} scale={scale} size={20} side={side} />
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, minWidth: 0 }}>
                    <div><span style={{ color: C.text, fontWeight: 600 }}>{fmt(x.soh, '%')}</span> SOH</div>
                    <div><span style={{ color: C.text }}>{fmt(x.energy_out_kwh, 'kWh', 0)}</span> out</div>
                    {x.hottest_position && <div>hottest {x.hottest_position}</div>}
                    <Warn w={x.latest_warnings} />
                  </div>
                </div>
              )}
              {x && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{x.logs ? `${x.logs} log${x.logs === 1 ? '' : 's'}` : 'no logs in period'} · last {fmtDate(x.last_log)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Every uploaded log, newest first — folded away by default.
function AllLogs({ trucks }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ ...cardStyle, padding: 0 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ ...linkBtn, color: C.text, width: '100%', textAlign: 'left', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} All uploaded logs
      </button>
      {open && <LogsTable trucks={trucks} />}
    </div>
  );
}

function LogsTable({ trucks, logs: given, fallback }) {
  const navigate = useNavigate();
  const [reports, setReports] = useState(given || null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (given) return;
    api.getBmsReports().then(setReports).catch((e) => setError(e.message));
  }, [given]);

  const slot = {};
  for (const t of trucks || []) for (const s of SIDES) {
    const x = t.sides[s];
    if (x) for (const h of [x.hwid, ...(x.other_hwids || [])]) slot[h] = sysLabel(t.name, s);
  }
  const rows = given || reports;

  return (
    <div style={{ overflowX: 'auto', borderTop: `1px solid ${C.border}` }}>
      <table style={{ ...tableStyle, minWidth: 900 }}>
        <thead>
          <tr>{['Battery', 'Period', 'Discharged', 'Charged', 'Peak out', 'Max temp', 'Cell spread', 'SOH', 'Flags'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {!rows ? (
            <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: error ? C.red : C.muted }}>{error || 'Loading…'}</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: C.muted }}>No BMS logs uploaded yet</td></tr>
          ) : rows.map((r) => {
            const s = r.summary || {};
            return (
              <tr key={r.id} onClick={() => navigate(`/bms/${r.id}`)} style={{ ...rowStyle, cursor: 'pointer' }}>
                <td style={tdStyle}>
                  <div style={{ color: C.text, fontWeight: 600 }}>{slot[r.hwid] || fallback || r.label || 'Not assigned'}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{shortId(r.hwid)}</div>
                </td>
                <td style={tdStyle}>
                  <div style={{ color: C.text }}>{fmtDate(r.start_time)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{fmt(s.hours, 'h')}</div>
                </td>
                <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>{fmt(s.discharge_kwh, 'kWh')}</td>
                <td style={tdStyle}>{fmt(s.charge_kwh, 'kWh')}</td>
                <td style={tdStyle}>{fmt(s.peak_discharge_kw, 'kW')}</td>
                <td style={tdStyle}>{fmt(s.max_temp_c, '°C', 0)}</td>
                <td style={tdStyle}>{fmt(s.max_cell_spread_mv, 'mV', 0)}</td>
                <td style={tdStyle}>{fmt(s.soh, '%')}</td>
                <td style={tdStyle}><Warn w={s.warnings} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- truck page: driver vs passenger -----------------------------------------------

const COMPARE_ROWS = [
  ['energy_out_kwh', 'Energy delivered', 'kWh', 0],
  ['vehicle_charges_est', 'Vehicle charges (est.)', '', 0],
  ['measured_capacity_kwh', 'Usable capacity (measured)', 'kWh', 0],
  ['full_discharge_hours', 'Time to fully discharge', 'h', 1],
  ['avg_discharge_kw', 'Average discharge power', 'kW', 0],
  ['peak_discharge_kw', 'Peak discharge power', 'kW', 0],
  ['soh', 'SOH', '%', 1],
  ['equivalent_full_cycles', 'Cycles', '', 0],
  ['max_temp_c', 'Max temperature', '°C', 0],
  ['max_cell_spread_mv', 'Max cell spread', 'mV', 0],
  ['charge_restarts', 'Charging restarts', '', 0],
];

// Plain-language list of what differs between the two sides.
function truckFindings(d, p, tot) {
  const out = [];
  if (!d || !p) {
    out.push({ level: 'info', text: `Only one side has a battery assigned — assign the ${d ? 'passenger' : 'driver'} side to compare.` });
    return out;
  }
  if (!d.logs || !p.logs) out.push({ level: 'info', text: `No logs in this period from the ${!d.logs ? 'driver' : 'passenger'} side.` });
  if (tot.passenger_share_pct != null && (tot.passenger_share_pct < 40 || tot.passenger_share_pct > 60)) {
    const more = tot.passenger_share_pct > 50 ? 'Passenger' : 'Driver';
    out.push({ level: 'warning', text: `${more} side delivered ${fmt(Math.max(tot.passenger_share_pct, 100 - tot.passenger_share_pct), '%', 0)} of the truck's energy — the two sides are not sharing the load evenly.` });
  }
  if (tot.max_temp_diff_c != null && Math.abs(tot.max_temp_diff_c) >= 3) {
    out.push({ level: Math.abs(tot.max_temp_diff_c) >= 6 ? 'warning' : 'info', text: `${tot.max_temp_diff_c > 0 ? 'Passenger' : 'Driver'} side runs ${fmt(Math.abs(tot.max_temp_diff_c), '°C', 0)} hotter at its peak.` });
  }
  if (tot.soh_diff != null && Math.abs(tot.soh_diff) >= 2) {
    out.push({ level: Math.abs(tot.soh_diff) >= 5 ? 'warning' : 'info', text: `${tot.soh_diff > 0 ? 'Driver' : 'Passenger'} side SOH is ${fmt(Math.abs(tot.soh_diff), 'points', 1)} lower — it is ageing faster.` });
  }
  if (d.measured_capacity_kwh != null && p.measured_capacity_kwh != null) {
    const gap = Math.abs(d.measured_capacity_kwh - p.measured_capacity_kwh);
    const pct = (gap / Math.max(d.measured_capacity_kwh, p.measured_capacity_kwh)) * 100;
    if (pct >= 5) out.push({ level: 'warning', text: `Usable capacity differs by ${fmt(gap, 'kWh', 0)} (${fmt(pct, '%', 0)}).` });
  }
  if (d.hottest_position && p.hottest_position) {
    out.push({ level: 'info', text: `Hottest module: driver ${d.hottest_position}, passenger ${p.hottest_position}${d.hottest_position === p.hottest_position ? ' — same spot on both packs, typical for the middle of the pack' : ''}.` });
  }
  if (!out.length) out.push({ level: 'info', text: 'The two sides are closely matched.' });
  return out;
}

export function TruckPage({ truck: truckNo, headerButtons }) {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getBmsFleet(days)
      .then((r) => { if (!cancelled) { setData(r); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [days]);

  const t = data?.trucks.find((x) => String(x.truck) === String(truckNo));
  const crumbs = <Crumbs items={[['All trucks', '/bms'], [t?.name || `Truck ${truckNo}`]]} />;
  if (error) return <>{crumbs}<Banner level="critical" text={error} /></>;
  if (!data) return <>{crumbs}<div style={{ color: C.muted }}>Loading…</div></>;
  if (!t) return <>{crumbs}<Banner level="warning" text={`No truck ${truckNo} in the Charge Trucks list.`} /></>;

  const d = t.sides.driver, p = t.sides.passenger;
  const tot = t.totals;
  const scale = heatScale([d?.module_temps || [], p?.module_temps || []]);
  const findings = truckFindings(d, p, tot);
  const diff = (k) => (d?.[k] != null && p?.[k] != null ? p[k] - d[k] : null);

  return (
    <>
      {crumbs}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>{t.name}</h1>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Driver-side and passenger-side batteries compared. Both see the same trips, weather and vehicles, so a difference points at one side.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <PeriodPicker days={days} onChange={setDays} />
          {headerButtons}
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <Grid>
          <Tile label="Energy delivered (both sides)" value={fmt(tot.energy_out_kwh, '', 0)} unit="kWh" sub={`last ${days} days`} accent={C.s2} />
          <Tile label="Usable energy in the truck" value={fmt(tot.measured_capacity_kwh, '', 0)} unit="kWh" sub="driver + passenger, measured" />
          <Tile label="Vehicle charges (est.)" value={fmt(tot.vehicle_charges_est, '', 0)} />
          <Tile label="Passenger share of energy" value={fmt(tot.passenger_share_pct, '', 0)} unit="%" sub="50% = evenly shared" />
        </Grid>
        <div style={{ marginTop: 14 }}>
          {findings.map((x, i) => {
            const L = LEVEL[x.level];
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: C.text, padding: '4px 0' }}>
                <L.Icon size={14} color={L.color} style={{ marginTop: 2, flexShrink: 0 }} /> {x.text}
              </div>
            );
          })}
        </div>
      </div>

      {/* Both packs side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12, marginBottom: 16 }}>
        {SIDES.map((side) => {
          const x = t.sides[side];
          return (
            <div key={side} style={{ ...cardStyle, cursor: x ? 'pointer' : 'default' }} onClick={() => x && navigate(`/bms/system/${encodeURIComponent(x.hwid)}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{SIDE_LABEL[side]}</div>
                {x && <span style={{ ...linkBtn, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Details <ChevronRight size={14} /></span>}
              </div>
              {!x ? <div style={{ fontSize: 13, color: C.muted }}>No battery assigned to this side yet. Upload a log from it and choose {t.name}, {SIDE_LABEL[side].toLowerCase()}.</div> : (
                <>
                  <MiniPack temps={x.module_temps} layout={data.layouts?.[side]} scale={scale} size={58} side={side} showLabels />
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
                    As seen standing outside the truck facing this pack · numbers are average module °C
                    {x.hottest_position && <> · hottest {x.hottest_position}{x.hottest_share != null && ` in ${fmt(x.hottest_share, '%', 0)} of logs`}</>}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: 'monospace' }}>{x.hwid}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginBottom: 12 }}><HeatLegend scale={scale} /></div>

      {d && p && (
        <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
          <table style={{ ...tableStyle, minWidth: 520 }}>
            <thead><tr>{['', 'Driver side', 'Passenger side', 'Passenger − driver'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {COMPARE_ROWS.map(([k, label, unit, dp]) => {
                const v = diff(k);
                return (
                  <tr key={k} style={rowStyle}>
                    <td style={{ ...tdStyle, color: C.text }}>{label}</td>
                    <td style={tdStyle}>{fmt(d[k], unit, dp)}</td>
                    <td style={tdStyle}>{fmt(p[k], unit, dp)}</td>
                    <td style={tdStyle}>{v == null ? '—' : `${v > 0 ? '+' : ''}${fmt(v, unit, dp)}`}</td>
                  </tr>
                );
              })}
              <tr style={rowStyle}>
                <td style={{ ...tdStyle, color: C.text }}>Hottest position</td>
                <td style={tdStyle}>{d.hottest_position || '—'}</td>
                <td style={tdStyle}>{p.hottest_position || '—'}</td>
                <td style={tdStyle} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// --- system page: one battery -----------------------------------------------------

export function SystemPage({ hwid, headerButtons }) {
  const profile = useProfile();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('last_30_days');
  const [assigning, setAssigning] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.getBmsSystem(hwid)
      .then((r) => { if (!cancelled) { setData(r); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [hwid, reload]);

  const a = data?.assignment;
  const truckCrumb = a?.truck != null ? [[data.truck_name || `Truck ${a.truck}`, `/bms/truck/${a.truck}`]] : [];
  const crumbs = <Crumbs items={[['All trucks', '/bms'], ...truckCrumb, [a?.side ? SIDE_LABEL[a.side] : shortId(hwid)]]} />;
  if (error) return <>{crumbs}<Banner level="critical" text={error} /></>;
  if (!data) return <>{crumbs}<div style={{ color: C.muted }}>Loading…</div></>;

  const s = data[range].logs ? data[range] : data.all_time;
  const usingAll = s === data.all_time;
  const scale = heatScale([s.module_temps || []]);
  const title = a?.truck != null ? sysLabel(data.truck_name || `Truck ${a.truck}`, a.side) : 'Battery not assigned to a truck';

  return (
    <>
      {crumbs}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {title}
            {canEditRole(profile) && <button onClick={() => setAssigning(true)} style={{ ...linkBtn, color: C.muted, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><Pencil size={12} /> {a?.truck != null ? 'Change' : 'Assign'}</button>}
          </h1>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Serial <code>{hwid}</code> · {data.logs.length} log{data.logs.length === 1 ? '' : 's'} · {fmtDate(data.logs[data.logs.length - 1]?.start_time)} → {fmtDate(data.logs[0]?.start_time)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {[['last_30_days', 'Last 30 days'], ['all_time', 'All logs']].map(([k, label], i) => (
              <button key={k} onClick={() => setRange(k)} style={{
                background: range === k ? '#2d5c2a55' : C.inner, color: range === k ? C.green : C.muted, border: 'none',
                borderLeft: i ? `1px solid ${C.border}` : 'none', padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
          {headerButtons}
        </div>
      </div>
      {range === 'last_30_days' && usingAll && <Banner level="info" text="No logs in the last 30 days — showing all logs." />}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ ...cardStyle, flex: '3 1 480px', minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Key numbers</div>
          <Grid min={150}>
            <Tile label="Usable capacity" value={fmt(s.measured_capacity_kwh, '', 0)} unit="kWh" sub="measured from discharges" accent={C.green} />
            <Tile label="Time to fully discharge" value={fmt(s.full_discharge_hours, '', 1)} unit="h" sub={s.full_discharge_hours != null ? `${fmt((s.full_discharge_hours * 60) / 10, 'min', 0)} per 10% SOC` : ''} />
            <Tile label="Energy delivered" value={fmt(s.energy_out_kwh, '', 0)} unit="kWh" sub={s.vehicle_charges_est ? `≈ ${fmt(s.vehicle_charges_est, '', 0)} vehicle charges` : ''} accent={C.s2} />
            <Tile label="SOH" value={fmt(s.soh, '', 1)} unit="%" sub="latest log" />
            <Tile label="Cycles" value={fmt(s.equivalent_full_cycles, '', 0)} sub={s.lifetime_discharge_kwh != null ? `${fmt(s.lifetime_discharge_kwh / 1000, 'MWh', 1)} lifetime out` : ''} />
            <Tile label="Max temperature" value={fmt(s.max_temp_c, '', 0)} unit="°C" />
            <Tile label="Max cell spread" value={fmt(s.max_cell_spread_mv, '', 0)} unit="mV" />
            <Tile label="Peak discharge" value={fmt(s.peak_discharge_kw, '', 0)} unit="kW" sub={s.avg_discharge_kw != null ? `${fmt(s.avg_discharge_kw, 'kW', 0)} average` : ''} />
          </Grid>
        </div>
        <div style={{ ...cardStyle, flex: '1 1 260px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Heat map</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Average module °C{usingAll ? '' : ', last 30 days'}, standing outside facing the pack.</div>
          <MiniPack temps={s.module_temps} layout={data.layouts?.[a?.side]} scale={scale} size={58} side={a?.side} showLabels />
          {s.hottest_position && <div style={{ fontSize: 12, color: C.text, marginTop: 8 }}>Hottest: {s.hottest_position} (module {s.hottest_module}){s.hottest_share != null && `, in ${fmt(s.hottest_share, '%', 0)} of logs`}</div>}
          <div style={{ marginTop: 8 }}><HeatLegend scale={scale} /></div>
        </div>
      </div>

      <ReportProvider value={{ t: enT, lang: 'en', print: false }}>
        <Trend trend={data.trend} />
      </ReportProvider>

      <div style={{ ...cardStyle, padding: 0, marginTop: 16 }}>
        <div style={{ padding: '14px 18px', fontSize: 15, fontWeight: 700, color: C.text }}>Logs from this battery</div>
        <LogsTable logs={data.logs.map((l) => ({ ...l, hwid }))} trucks={[]} fallback={title} />
      </div>

      {assigning && (
        <AssignDialog hwid={hwid} current={a} onClose={() => setAssigning(false)} onSaved={() => { setAssigning(false); setReload((n) => n + 1); }} />
      )}
    </>
  );
}

