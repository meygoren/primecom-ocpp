import { useState, useEffect, useMemo } from 'react';
import { Play, Pause, Eye } from 'lucide-react';
import { C, HEAT, heatColor, mix, useReport, fmt, fmtDate, btnStyle, tableStyle, thStyle, tdStyle, rowStyle } from '../../lib/bmsUi';
import { Section } from './BmsSections';

// Pack view: the battery drawn as seen standing outside the truck, facing the
// pack — a grid of modules, each split into its temperature sensors (heat
// map) or its cells (balance map) — plus a top-down truck diagram showing
// which side the pack is on, and a module ranking.

// Balance: blue (below pack average) ↔ grey (average) ↔ orange (above).
const COOL = '#3987e5';
const WARM = '#d95926';
const MID = '#383835';

function balanceColor(v, maxAbs) {
  if (v == null) return C.inner;
  const t = maxAbs ? Math.max(-1, Math.min(1, v / maxAbs)) : 0;
  return t < 0 ? mix(MID, COOL, -t) : mix(MID, WARM, t);
}

// Grid shape for n items inside a module box: prefer an exact divisor of n
// (16 sensors → 4×4, 48 cells → 8×6) close to the box's aspect ratio.
function innerGrid(n, aspect) {
  const ideal = Math.sqrt(n * aspect);
  let best = Math.ceil(ideal);
  for (let c = 1; c <= n; c++) {
    if (n % c === 0 && Math.abs(c - ideal) < Math.abs(best - ideal) + (n % best === 0 ? 0 : 1)) best = c;
  }
  return { cols: best, rows: Math.ceil(n / best) };
}

export default function PackView({ a }) {
  const { t, lang, print, onSetMount, canEdit } = useReport();
  const pack = a.pack;
  const frames = a.frames;
  const [view, setView] = useState('heat');
  const [when, setWhen] = useState(frames ? 'peak' : 'avg');
  const [frame, setFrame] = useState(frames?.hottest_index >= 0 ? frames.hottest_index : 0);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!playing || !frames) return undefined;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.t.length), 220);
    return () => clearInterval(id);
  }, [playing, frames]);

  const tempById = useMemo(() => new Map(a.temps.all.map((s) => [s.n, s])), [a.temps.all]);
  const cellById = useMemo(() => new Map(a.cells.all.map((c) => [c.n, c])), [a.cells.all]);

  // Fixed colour scale across all frames, so the animation is comparable.
  const scale = useMemo(() => {
    if (view === 'heat') {
      let lo = Infinity, hi = -Infinity;
      const take = (v) => { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } };
      if (frames && when !== 'avg') frames.temps.forEach((row) => row.forEach(take));
      else a.temps.all.forEach((s) => take(s.avg_c));
      return { lo: Math.floor(lo), hi: Math.ceil(hi) };
    }
    // 95th percentile of |deviation| rather than the maximum, so one moment of
    // wide spread near full charge does not wash out every other moment.
    const devs = [];
    if (frames && when !== 'avg') {
      frames.cells.forEach((row) => {
        const vals = row.filter((v) => v != null);
        const m = vals.reduce((x, y) => x + y, 0) / (vals.length || 1);
        vals.forEach((v) => devs.push(Math.abs(v - m)));
      });
    } else a.cells.all.forEach((c) => devs.push(Math.abs(c.avg_dev_mv)));
    devs.sort((x, y) => x - y);
    const p95 = devs.length ? devs[Math.floor(devs.length * 0.95)] : 0;
    return { maxAbs: Math.max(5, Math.ceil(p95)) };
  }, [view, when, frames, a.temps.all, a.cells.all]);

  if (!pack || !pack.modules?.length) return null;

  const fi = when === 'peak' ? Math.max(0, frames?.hottest_index ?? 0) : frame;
  const frameMean = (() => {
    if (!frames || when === 'avg' || view !== 'cells') return null;
    const vals = frames.cells[fi].filter((v) => v != null);
    return vals.reduce((x, y) => x + y, 0) / (vals.length || 1);
  })();

  const sensorValue = (n) => (when === 'avg' || !frames ? tempById.get(n)?.avg_c ?? null : frames.temps[fi]?.[n - 1] ?? null);
  const cellValue = (n) => {
    if (when === 'avg' || !frames) return cellById.get(n)?.avg_dev_mv ?? null;
    const v = frames.cells[fi]?.[n - 1];
    return v == null ? null : v - frameMean;
  };

  const { layout_columns: cols, layout_rows: rows } = pack.config;
  const posLabel = (m) => m.position || t('col_pos', { c: m.column, r: t(`row_${m.row}`) || m.row });
  const hottest = pack.modules.find((m) => m.module === pack.hottest_module);
  const badChecks = pack.checks.filter((c) => !c.ok);

  // --- pack face drawing ---
  const MW = 230, MH = 150, GAP = 14, PADL = 54, PADT = 34, PADB = 30;
  const width = PADL + cols * MW + (cols - 1) * GAP + 10;
  const height = PADT + rows * MH + (rows - 1) * GAP + PADB;
  const mount = pack.mount;
  // Passenger side: standing outside facing the pack, the front of the truck is on your right.
  const frontOnRight = mount === 'passenger' ? true : mount === 'driver' ? false : null;

  function moduleBox(m) {
    const x = PADL + (m.column - 1) * (MW + GAP);
    const y = PADT + (m.row - 1) * (MH + GAP);
    const items = [];
    if (view === 'heat' && m.sensor_start) for (let n = m.sensor_start; n <= m.sensor_end; n++) items.push(n);
    if (view === 'cells') for (let n = m.cell_start; n <= m.cell_end; n++) items.push(n);
    const g = innerGrid(Math.max(1, items.length), (MW - 12) / (MH - 34));
    const iw = (MW - 12) / g.cols;
    const ih = (MH - 34) / g.rows;
    const isHot = m.module === pack.hottest_module && view === 'heat';
    const summary = view === 'heat'
      ? (when === 'avg' || !frames ? fmt(m.avg_temp_c, '°C') : fmt(Math.max(...items.map(sensorValue).filter((v) => v != null)), '°C', 0))
      : fmt(m.cell_vs_pack_mv, 'mV');

    return (
      <g key={m.module}>
        <rect x={x} y={y} width={MW} height={MH} rx={10} fill={C.card} stroke={isHot ? C.amber : C.border} strokeWidth={isHot ? 2 : 1} />
        <text x={x + 10} y={y + 18} fill={C.text} fontSize={13} fontWeight={700}>{t('module_pos', { pos: m.position, n: m.module })}</text>
        <text x={x + MW - 10} y={y + 18} fill={C.muted} fontSize={11} textAnchor="end">{summary}</text>
        {items.map((n, k) => {
          const v = view === 'heat' ? sensorValue(n) : cellValue(n);
          const fill = view === 'heat' ? heatColor(v, scale.lo, scale.hi) : balanceColor(v, scale.maxAbs);
          const cx = x + 6 + (k % g.cols) * iw;
          const cy = y + 26 + Math.floor(k / g.cols) * ih;
          const label = view === 'heat'
            ? t('sensor_detail', { n, m: m.module, v: v == null ? '—' : `${fmt(v, '°C', 1)}` })
            : t('cell_detail', { n, m: m.module, v: v == null ? '—' : t('vs_pack_avg', { v: `${v > 0 ? '+' : ''}${fmt(v, 'mV', 1)}` }) });
          const active = hover?.n === n && hover?.view === view;
          return (
            <rect
              key={n}
              x={cx + 1}
              y={cy + 1}
              width={Math.max(1, iw - 2)}
              height={Math.max(1, ih - 2)}
              rx={view === 'heat' ? 4 : 2}
              fill={fill}
              stroke={active ? C.text : 'none'}
              strokeWidth={active ? 1.5 : 0}
              onMouseEnter={() => setHover({ n, view, label })}
              onClick={() => setHover({ n, view, label })}
              style={{ cursor: 'pointer' }}
            >
              <title>{label}</title>
            </rect>
          );
        })}
      </g>
    );
  }

  return (
    <Section title={t('pack_view')} subtitle={t('pack_view_sub')}>
      {/* Spec line + checks */}
      <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>
        <strong>{pack.config.system_name}</strong>{' · '}
        {t('pack_spec', {
          s: pack.config.strings_in_parallel, m: pack.config.modules_in_series, c: pack.config.cells_per_module,
          cell: [pack.config.cell_maker, pack.config.chemistry, `${pack.config.cell_nominal_v} V ${pack.config.cell_capacity_ah} Ah`].filter(Boolean).join(' '),
          v: pack.spec.pack_v, ah: pack.spec.pack_ah, kwh: pack.spec.pack_kwh, mk: pack.spec.module_kwh,
        })}
      </div>
      {badChecks.length > 0 && (
        <div style={{ fontSize: 12, color: C.amber, marginBottom: 10 }}>
          {t('pack_check_bad', { what: badChecks.map((c) => `${c.key}: ${c.expected} vs ${c.file}`).join(', ') })}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        {/* Pack face */}
        <div style={{ minWidth: 0, flex: '3 1 520px' }}>
          {!print && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <Toggle options={[['heat', t('view_heat')], ['cells', t('view_cells')]]} value={view} onChange={setView} />
              <Toggle
                options={[['avg', t('when_avg')], ...(frames ? [['peak', t('when_peak')], ['time', t('when_time')]] : [])]}
                value={when}
                onChange={(w) => { setWhen(w); setPlaying(false); }}
              />
            </div>
          )}
          {!frames && !print && <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{t('no_snapshots')}</div>}

          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width, display: 'block' }} role="img" aria-label={t('pack_view')} onMouseLeave={() => setHover(null)}>
              {/* front-of-truck arrow */}
              {frontOnRight != null && (
                <g>
                  <text x={frontOnRight ? width - 10 : PADL} y={16} fill={C.muted} fontSize={11} textAnchor={frontOnRight ? 'end' : 'start'}>
                    {frontOnRight ? `${t('front')} →` : `← ${t('front')}`}
                  </text>
                </g>
              )}
              {/* row labels */}
              <text x={PADL - 10} y={PADT + 16} fill={C.muted} fontSize={11} textAnchor="end">{t('top')}</text>
              <text x={PADL - 10} y={PADT + rows * MH + (rows - 1) * GAP - 6} fill={C.muted} fontSize={11} textAnchor="end">{t('bottom')}</text>
              {pack.modules.map(moduleBox)}
              {/* string labels under each column */}
              {Array.from({ length: cols }, (_, c) => {
                const mod = pack.modules.find((m) => m.column === c + 1);
                return (
                  <text key={c} x={PADL + c * (MW + GAP) + MW / 2} y={height - 10} fill={C.muted} fontSize={11} textAnchor="middle">
                    {mod ? t('string_n', { n: mod.string }) : ''}
                  </text>
                );
              })}
            </svg>
          </div>

          {/* legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 11, color: C.muted, flexWrap: 'wrap' }}>
            {view === 'heat' ? (
              <>
                <span>{scale.lo}°C</span>
                <span style={{ width: 160, height: 10, borderRadius: 5, background: `linear-gradient(90deg, ${HEAT.join(',')})` }} />
                <span>{scale.hi}°C</span>
              </>
            ) : (
              <>
                <span>−{scale.maxAbs} mV</span>
                <span style={{ width: 160, height: 10, borderRadius: 5, background: `linear-gradient(90deg, ${COOL}, ${MID}, ${WARM})` }} />
                <span>+{scale.maxAbs} mV {lang === 'zh' ? '（相对整包均值）' : 'vs pack average'}</span>
              </>
            )}
            {!print && <span style={{ marginLeft: 'auto', color: hover ? C.text : C.muted }}>{hover?.label || t('hover_hint')}</span>}
          </div>

          {/* time controls */}
          {frames && when !== 'avg' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: C.text, marginBottom: 6 }}>
                {t('frame_at', { time: fmtDate(frames.t[fi], lang), soc: frames.soc[fi] ?? '—', kw: frames.kw[fi] == null ? '—' : `${frames.kw[fi] > 0 ? '+' : ''}${fmt(frames.kw[fi], 'kW')}` })}
              </div>
              {when === 'time' && !print && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setPlaying((p) => !p)} style={{ ...btnStyle(), padding: '5px 10px' }}>
                    {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? t('pause') : t('play')}
                  </button>
                  <input type="range" min={0} max={frames.t.length - 1} value={frame} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} style={{ flex: 1, accentColor: C.green }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Truck diagram */}
        <div style={{ flex: '1 1 220px', maxWidth: 320, minWidth: 0 }}>
          <TruckDiagram mount={mount} onSetMount={onSetMount} canEdit={canEdit} />
        </div>
      </div>

      {hottest && hottest.temp_vs_pack_c > 0.5 && (
        <div style={{ fontSize: 13, color: C.text, marginTop: 14 }}>
          {t('hottest_module', { m: hottest.module, pos: posLabel(hottest), d: fmt(hottest.temp_vs_pack_c, '', 1) })}
        </div>
      )}

      {/* Module ranking */}
      <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, margin: '14px 0 6px' }}>{t('modules_ranked')}</div>
      <div style={{ overflowX: print ? 'visible' : 'auto' }}>
        <table style={{ ...tableStyle, minWidth: print ? 0 : 720 }}>
          <thead><tr>{['col_module', 'col_position', 'col_string', 'col_avg_temp', 'col_max_temp', 'col_temp_vs_pack', 'col_cell_balance', 'col_weakest'].map((h) => <th key={h} style={thStyle}>{t(h)}</th>)}</tr></thead>
          <tbody>
            {[...pack.modules].sort((x, y) => (y.avg_temp_c ?? -99) - (x.avg_temp_c ?? -99)).map((m) => (
              <tr key={m.module} style={rowStyle}>
                <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>{m.module}</td>
                <td style={tdStyle}>{posLabel(m)}</td>
                <td style={tdStyle}>{m.string}</td>
                <td style={{ ...tdStyle, color: C.text }}>{fmt(m.avg_temp_c, '°C')}</td>
                <td style={tdStyle}>{fmt(m.max_temp_c, '°C', 0)}</td>
                <td style={tdStyle}>{m.temp_vs_pack_c == null ? '—' : `${m.temp_vs_pack_c > 0 ? '+' : ''}${fmt(m.temp_vs_pack_c, '°C', 1)}`}</td>
                <td style={tdStyle}>{m.cell_vs_pack_mv == null ? '—' : `${m.cell_vs_pack_mv > 0 ? '+' : ''}${fmt(m.cell_vs_pack_mv, 'mV', 1)}`}</td>
                <td style={tdStyle}>{m.weakest_cell ? `#${m.weakest_cell} (${fmt(m.weakest_cell_mv, 'mV', 1)})` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// Top-down truck: front at the top, driver side on the left (US), passenger on
// the right. Two packs between the axles, facing outward; the eye shows where
// you stand to see the pack face drawn above.
function TruckDiagram({ mount, onSetMount, canEdit }) {
  const { t, print } = useReport();
  const W = 240, H = 300;
  const side = (s) => mount === s;
  const pack = (x, s) => (
    <g>
      <rect x={x} y={120} width={26} height={90} rx={4} fill={side(s) ? '#d9592633' : C.inner} stroke={side(s) ? C.s2 : C.border} strokeWidth={side(s) ? 2 : 1} />
      <text x={x + 13} y={170} fill={side(s) ? C.text : C.muted} fontSize={9} textAnchor="middle" transform={`rotate(-90 ${x + 13} 168)`}>
        {side(s) ? t('this_pack') : ''}
      </text>
    </g>
  );
  const eyeX = mount === 'passenger' ? W - 18 : 18;

  return (
    <div style={{ background: C.inner, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{t('truck_top')}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 260, display: 'block', margin: '0 auto' }} role="img" aria-label={t('truck_top')}>
        <text x={W / 2} y={14} fill={C.muted} fontSize={10} textAnchor="middle">▲ {t('front')}</text>
        {/* cab + body */}
        <rect x={70} y={24} width={100} height={60} rx={14} fill={C.card} stroke={C.border} />
        <rect x={64} y={88} width={112} height={196} rx={8} fill={C.card} stroke={C.border} />
        {/* wheels */}
        {[[56, 40], [174, 40], [56, 236], [174, 236]].map(([x, y], i) => <rect key={i} x={x} y={y} width={10} height={30} rx={3} fill={C.border} />)}
        {pack(36, 'driver')}
        {pack(178, 'passenger')}
        <text x={18} y={292} fill={side('driver') ? C.text : C.muted} fontSize={10}>{t('side_driver')}</text>
        <text x={W - 18} y={292} fill={side('passenger') ? C.text : C.muted} fontSize={10} textAnchor="end">{t('side_passenger')}</text>
        {mount && (
          <g>
            <circle cx={eyeX} cy={165} r={9} fill={C.bg} stroke={C.green} />
            <circle cx={eyeX} cy={165} r={3} fill={C.green} />
            <line x1={mount === 'passenger' ? eyeX - 11 : eyeX + 11} y1={165} x2={mount === 'passenger' ? 208 : 62} y2={165} stroke={C.green} strokeWidth={1.5} strokeDasharray="3 3" />
          </g>
        )}
      </svg>
      <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 4, display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center' }}>
        <Eye size={12} /> {t('view_from_outside')}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: C.text, textAlign: 'center' }}>
        {t('mounted_on')}:{' '}
        {canEdit && !print && onSetMount ? (
          <select value={mount || ''} onChange={(e) => onSetMount(e.target.value || null)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, padding: '3px 6px' }}>
            <option value="">{t('side_unknown')}</option>
            <option value="passenger">{t('side_passenger')}</option>
            <option value="driver">{t('side_driver')}</option>
          </select>
        ) : (
          <strong>{mount ? t(`side_${mount}`) : t('side_unknown')}</strong>
        )}
      </div>
    </div>
  );
}

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {options.map(([id, label], i) => (
        <button key={id} onClick={() => onChange(id)} style={{
          background: value === id ? '#2d5c2a55' : C.inner, color: value === id ? C.green : C.muted, border: 'none',
          borderLeft: i ? `1px solid ${C.border}` : 'none', padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>{label}</button>
      ))}
    </div>
  );
}
