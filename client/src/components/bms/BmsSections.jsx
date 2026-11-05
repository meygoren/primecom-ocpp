import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { warningText } from '../../lib/bmsI18n';
import {
  C, LEVEL, useReport, n, fmt, fmtDate, fmtDay, fmtMin, linkBtn, cardStyle, tableStyle, thStyle, tdStyle,
  tooltipStyle, rowStyle, axisTick, chartMargin, timeAxis,
} from '../../lib/bmsUi';

// Report sections shared by the BMS report page and its PDF/print view.
// Wrap them in <ReportProvider value={{ t, lang, print }}> from lib/bmsUi.

// --- the whole report body ----------------------------------------------------------

// data: { report, analysis, previous, trend }
// extras: nodes rendered after the trend (team notes / Claude analysis / chat).
export function ReportBody({ data, onOpenReport, extras }) {
  const { analysis: a, previous, trend, report } = data;
  const s = a.summary;
  const on = a.settings.sections;
  return (
    <>
      {on.overview && <Overview s={s} limits={a.settings.limits} />}
      {on.warnings && <Warnings warnings={a.warnings} />}
      {on.comparison && <Comparison s={s} previous={previous} onOpen={onOpenReport} />}
      {on.trend !== false && <Trend trend={trend} />}
      {extras}
      {on.events && <Events events={a.events} limits={a.settings.limits} />}
      {on.power_chart && <PowerCharts series={a.series} limits={a.settings.limits} />}
      {on.temperature && <TemperatureSection a={a} />}
      {on.temp_derating && <Derating derating={a.derating} />}
      {on.cells && <CellSection a={a} />}
      {on.cell_outliers && <Outliers a={a} />}
      {on.vehicles && <Vehicles a={a} vehicle={report.vehicle} />}
      {on.energy && <Energy s={s} />}
      {on.insulation && <Insulation a={a} />}
      {on.faults && <Faults a={a} />}
      {on.gaps && <Gaps gaps={a.gaps} />}
    </>
  );
}

// --- sections --------------------------------------------------------------------------

function Overview({ s, limits }) {
  const { t } = useReport();
  const sess = (k) => t(k === 1 ? 'n_session' : 'n_sessions', { n: k });
  return (
    <Section title={t('overview')}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Tile label={t('energy_out')} value={fmt(s.discharge_kwh)} unit="kWh" accent={C.s2} sub={`${sess(s.discharge_sessions)} · ${fmtMin(s.discharge_hours * 60)}`} />
        <Tile label={t('energy_in')} value={fmt(s.charge_kwh)} unit="kWh" accent={C.s1} sub={`${sess(s.charge_sessions)} · ${fmtMin(s.charge_hours * 60)}`} />
        <Tile label={t('peak_output')} value={fmt(s.peak_discharge_kw)} unit="kW" sub={t('avg_limit', { v: fmt(s.avg_discharge_kw, 'kW'), l: limits.system_kw })} />
        <Tile label={t('peak_discharge_current')} value={fmt(s.peak_discharge_a, '', 0)} unit="A" sub={t('limit_a', { l: limits.discharge_current_a })} />
        <Tile label={t('peak_input')} value={fmt(s.peak_charge_kw)} unit="kW" sub={t('avg_amps', { v: fmt(s.avg_charge_kw, 'kW'), a: fmt(s.peak_charge_a, 'A', 0) })} />
        <Tile label={t('soc_range')} value={`${fmt(s.soc_min, '', 0)}–${fmt(s.soc_max, '', 0)}`} unit="%" sub={t('start_end', { a: fmt(s.soc_start, '%', 0), b: fmt(s.soc_end, '%', 0) })} />
        <Tile label={t('soh')} value={fmt(s.soh)} unit="%" />
        <Tile label={t('cell_temp')} value={`${fmt(s.min_temp_c, '', 0)}–${fmt(s.max_temp_c, '', 0)}`} unit="°C" sub={t('max_spread', { v: fmt(s.max_temp_spread_c, '°C', 0) })} />
        <Tile label={t('max_cell_spread')} value={fmt(s.max_cell_spread_mv, '', 0)} unit="mV" sub={t('cells_range', { a: fmt(s.min_cell_v, 'V', 3), b: fmt(s.max_cell_v, 'V', 3) })} />
        <Tile label={t('warnings')} value={<WarningCounts w={s.warnings} big />} />
      </div>
    </Section>
  );
}

function Warnings({ warnings }) {
  const { t } = useReport();
  return (
    <Section title={t('warnings')} subtitle={t('warnings_sub')}>
      {warnings.length === 0 ? (
        <div style={{ color: C.green, fontSize: 13 }}>{t('warnings_none')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {warnings.map((w, k) => {
            const L = LEVEL[w.level];
            return (
              <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: C.inner, border: `1px solid ${L.color}44`, borderRadius: 8, padding: '10px 12px', breakInside: 'avoid' }}>
                <L.Icon size={15} color={L.color} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 700, marginRight: 6 }}>{t(`level_${w.level}`)}</span>{warningText(w, t)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

const COMPARE_ROWS = [
  ['discharge_kwh', 'kWh', null],
  ['charge_kwh', 'kWh', null],
  ['peak_discharge_kw', 'kW', null],
  ['avg_discharge_kw', 'kW', null],
  ['avg_charge_kw', 'kW', null],
  ['max_temp_c', '°C', 'lower'],
  ['max_temp_spread_c', '°C', 'lower'],
  ['max_cell_spread_mv', 'mV', 'lower'],
  ['min_cell_v', 'V', 'higher'],
  ['soh', '%', 'higher'],
  ['min_insulation_kohm', 'kΩ', 'higher'],
];

function Comparison({ s, previous, onOpen }) {
  const { t, lang, print } = useReport();
  return (
    <Section title={t('comparison')} subtitle={previous ? t('comparison_sub', { date: fmtDate(previous.start_time, lang) }) : null}>
      {!previous ? (
        <div style={{ color: C.muted, fontSize: 13 }}>{t('comparison_first')}</div>
      ) : (
        <>
          <TableWrap>
            <table style={tableStyle}>
              <thead><tr>{['', t('this_log'), t('previous'), t('change')].map((h, k) => <th key={k} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {COMPARE_ROWS.map(([key, unit, better]) => {
                  const a = n(s[key]); const b = n(previous.summary?.[key]);
                  const diff = a != null && b != null ? a - b : null;
                  const good = diff == null || diff === 0 || !better ? null : (better === 'lower') === diff < 0;
                  const digits = unit === 'V' ? 3 : 1;
                  return (
                    <tr key={key} style={rowStyle}>
                      <td style={{ ...tdStyle, color: C.text }}>{t(`m_${key}`)}</td>
                      <td style={tdStyle}>{fmt(a, unit, digits)}</td>
                      <td style={tdStyle}>{fmt(b, unit, digits)}</td>
                      <td style={{ ...tdStyle, color: good == null ? C.muted : good ? C.green : C.amber, fontWeight: 600 }}>
                        {diff == null ? '—' : `${diff > 0 ? '+' : ''}${fmt(diff, unit, digits)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          {!print && onOpen && <button onClick={() => onOpen(previous.id)} style={{ ...linkBtn, marginTop: 10 }}>{t('open_previous')}</button>}
        </>
      )}
    </Section>
  );
}

const TREND_ROWS = [
  ['discharge_kwh', 'kWh', 1], ['charge_kwh', 'kWh', 1], ['avg_discharge_kw', 'kW', 1], ['peak_discharge_a', 'A', 0],
  ['max_temp_c', '°C', 1], ['max_temp_spread_c', '°C', 1], ['max_cell_spread_mv', 'mV', 0], ['weakest_cell_dev_mv', 'mV', 1],
  ['min_cell_v', 'V', 3], ['soh', '%', 1], ['charge_restarts', '', 0], ['min_insulation_kohm', 'kΩ', 0],
];

const DIR = {
  improving: { color: C.green, Icon: ArrowUpRight },
  worsening: { color: C.amber, Icon: ArrowDownRight },
  stable: { color: C.muted, Icon: Minus },
  up: { color: C.muted, Icon: ArrowUpRight },
  down: { color: C.muted, Icon: ArrowDownRight },
};

function Trend({ trend }) {
  const { t, lang } = useReport();
  if (!trend) return null;
  const metrics = Object.fromEntries((trend.metrics || []).map((m) => [m.key, m]));
  const points = (trend.points || []).map((p) => ({ ...p, day: fmtDay(p.start, lang) }));

  if (trend.logs < 2) {
    return <Section title={t('trend')}><div style={{ color: C.muted, fontSize: 13 }}>{t('trend_one')}</div></Section>;
  }

  return (
    <Section title={t('trend')} subtitle={t('trend_sub', { n: trend.logs, from: fmtDay(trend.first_start, lang), to: fmtDay(trend.last_start, lang) })}>
      <TableWrap>
        <table style={{ ...tableStyle, minWidth: 720 }}>
          <thead><tr>{[t('metric'), t('first'), t('previous'), t('this_log'), t('vs_previous'), t('per_day'), t('direction')].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {TREND_ROWS.map(([key, unit, d]) => {
              const m = metrics[key];
              if (!m || !m.count) return null;
              const dir = m.direction ? DIR[m.direction] : null;
              return (
                <tr key={key} style={rowStyle}>
                  <td style={{ ...tdStyle, color: C.text }}>{t(`m_${key}`)}</td>
                  <td style={tdStyle}>{fmt(m.first, unit, d)}</td>
                  <td style={tdStyle}>{fmt(m.previous, unit, d)}</td>
                  <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>{fmt(m.last, unit, d)}</td>
                  <td style={tdStyle}>{m.change_vs_previous == null ? '—' : `${m.change_vs_previous > 0 ? '+' : ''}${fmt(m.change_vs_previous, unit, d)}`}</td>
                  <td style={tdStyle}>{m.per_day == null ? '—' : `${m.per_day > 0 ? '+' : ''}${fmt(m.per_day, unit, d === 0 ? 1 : d)}`}</td>
                  <td style={tdStyle}>
                    {dir ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: dir.color, fontWeight: 600 }}>
                        <dir.Icon size={13} /> {t(`dir_${m.direction}`)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>

      {(trend.recurring_weak_cell?.logs > 1 || trend.recurring_hot_sensor?.logs > 1) && (
        <div style={{ fontSize: 13, color: C.text, marginTop: 12, lineHeight: 1.6 }}>
          {trend.recurring_weak_cell?.logs > 1 && <div>{t('recurring_weak', { c: trend.recurring_weak_cell.cell, n: trend.recurring_weak_cell.logs, of: trend.recurring_weak_cell.of })}</div>}
          {trend.recurring_hot_sensor?.logs > 1 && <div>{t('recurring_hot', { s: trend.recurring_hot_sensor.sensor, n: trend.recurring_hot_sensor.logs, of: trend.recurring_hot_sensor.of })}</div>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14, marginTop: 8 }}>
        <ChartBox title={t('energy_per_log')} height={170}>
          <BarChart data={points} margin={chartMargin}>
            <CartesianGrid stroke={C.border} vertical={false} />
            <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff0d' }} formatter={(v, name) => [fmt(v, 'kWh'), name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={8} />
            <Bar name={t('out')} dataKey="discharge_kwh" fill={C.s2} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar name={t('in')} dataKey="charge_kwh" fill={C.s1} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ChartBox>
        {[['max_temp_c', '°C', C.s2], ['max_cell_spread_mv', 'mV', C.s3], ['soh', '%', C.s1], ['weakest_cell_dev_mv', 'mV', C.s2]].map(([key, unit, color]) => (
          <ChartBox key={key} title={`${t(`m_${key}`)} (${unit})`} height={170}>
            <LineChart data={points} margin={chartMargin}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(v, unit, unit === 'V' ? 3 : 1), t(`m_${key}`)]} />
              <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={{ r: 4, fill: color, stroke: C.card, strokeWidth: 2 }} isAnimationActive={false} connectNulls />
            </LineChart>
          </ChartBox>
        ))}
      </div>
    </Section>
  );
}

function Events({ events, limits }) {
  const { t, lang } = useReport();
  return (
    <Section title={t('sessions')} subtitle={t('sessions_sub')}>
      {events.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>{t('sessions_none')}</div> : (
        <TableWrap>
          <table style={{ ...tableStyle, minWidth: 1100 }}>
            <thead>
              <tr>{['col_type', 'col_start', 'col_duration', 'col_energy', 'col_avg_kw', 'col_peak_kw', 'col_avg_a', 'col_peak_a', 'col_soc', 'col_temp', 'col_min_cell', 'col_spread', 'col_notes'].map((h) => <th key={h} style={thStyle}>{t(h)}</th>)}</tr>
            </thead>
            <tbody>
              {events.map((e, k) => {
                const notes = [];
                if (e.interruptions) notes.push(t(e.interruptions === 1 ? 'n_restart' : 'n_restarts', { n: e.interruptions }));
                if (e.minutes_at_current_limit) notes.push(t('at_limit', { d: fmtMin(e.minutes_at_current_limit), l: limits.discharge_current_a }));
                if (e.minutes_over_power_limit) notes.push(t('over_kw', { d: fmtMin(e.minutes_over_power_limit), l: e.type === 'discharge' ? limits.system_kw : limits.charger_kw }));
                if (e.type === 'charge' && e.requested_a) notes.push(t('requested', { v: e.requested_v, a: e.requested_a, p: fmt(e.delivered_vs_requested_pct, '%', 0) }));
                if (e.type === 'discharge' && e.vehicle_sessions_est) notes.push(t('vehicle_charges', { n: e.vehicle_sessions_est }));
                return (
                  <tr key={k} style={rowStyle}>
                    <td style={tdStyle}><TypePill type={e.type} /></td>
                    <td style={tdStyle}>{fmtDate(e.start, lang)}</td>
                    <td style={tdStyle}>{fmtMin(e.duration_min)}</td>
                    <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>{fmt(e.energy_kwh, 'kWh')}</td>
                    <td style={tdStyle}>{fmt(e.avg_kw)}</td>
                    <td style={tdStyle}>{fmt(e.peak_kw)}</td>
                    <td style={tdStyle}>{fmt(e.avg_a, '', 0)}</td>
                    <td style={tdStyle}>{fmt(e.peak_a, '', 0)}</td>
                    <td style={tdStyle}>{fmt(e.soc_start, '', 0)} → {fmt(e.soc_end, '%', 0)}</td>
                    <td style={tdStyle}>{fmt(e.temp_start_c, '', 0)} → {fmt(e.temp_max_c, '°C', 0)}</td>
                    <td style={tdStyle}>{fmt(e.min_cell_v, 'V', 3)}</td>
                    <td style={tdStyle}>{e.max_cell_spread_v != null ? fmt(e.max_cell_spread_v * 1000, 'mV', 0) : '—'}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', minWidth: 240, fontSize: 12 }}>{notes.join(' · ') || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Section>
  );
}

function PowerCharts({ series, limits }) {
  const { t, lang } = useReport();
  return (
    <Section title={t('power_soc')} subtitle={t('power_soc_sub')}>
      <ChartBox title={t('power_kw')} height={220}>
        <AreaChart data={series} margin={chartMargin}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis {...timeAxis} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={50} />
          <ReferenceLine y={0} stroke={C.muted} />
          <ReferenceLine y={-limits.system_kw} stroke={C.muted} strokeDasharray="4 4" label={{ value: t('kw_rating', { l: limits.system_kw }), fill: C.muted, fontSize: 10, position: 'insideBottomLeft' }} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtDate(v, lang)} formatter={(v, _k, item) => [`${fmt(v, 'kW')} · ${fmt(item.payload.a, 'A', 0)}`, t('power')]} />
          <Area type="stepAfter" dataKey="kw" stroke={C.s1} strokeWidth={1.5} fill={C.s1} fillOpacity={0.18} isAnimationActive={false} />
        </AreaChart>
      </ChartBox>
      <ChartBox title={t('soc_pct')} height={160}>
        <LineChart data={series} margin={chartMargin}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis {...timeAxis} />
          <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} width={50} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtDate(v, lang)} formatter={(v) => [fmt(v, '%'), 'SOC']} />
          <Line type="monotone" dataKey="soc" stroke={C.s3} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartBox>
    </Section>
  );
}

function TemperatureSection({ a }) {
  const { t, lang } = useReport();
  const e = a.extremes;
  const at = (x) => (x ? `${fmtDate(x.t, lang)} · SOC ${x.soc}% · ${t(`state_${x.state}`)}` : '');
  return (
    <Section title={t('temperature')} subtitle={t('temperature_sub')}>
      <ChartBox title={t('cell_temp_c')} height={220}>
        <LineChart data={a.series} margin={chartMargin}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis {...timeAxis} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={50} domain={['dataMin - 2', 'dataMax + 2']} />
          <ReferenceLine y={a.settings.thresholds.temp_warn_c} stroke={C.amber} strokeDasharray="4 4" ifOverflow="hidden" />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtDate(v, lang)} formatter={(v, name) => [fmt(v, '°C', 0), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
          <Line name={t('hottest_sensor')} type="monotone" dataKey="max_t" stroke={C.s2} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line name={t('average')} type="monotone" dataKey="avg_t" stroke={C.s3} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line name={t('coolest_sensor')} type="monotone" dataKey="min_t" stroke={C.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartBox>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
        <Fact label={t('hottest_reading')} value={e.max_temp ? t('on_sensor', { v: e.max_temp.value, s: e.max_temp.sensor }) : '—'} sub={at(e.max_temp)} />
        <Fact label={t('coolest_reading')} value={e.min_temp ? t('on_sensor', { v: e.min_temp.value, s: e.min_temp.sensor }) : '—'} sub={at(e.min_temp)} />
        <Fact label={t('largest_temp_spread')} value={fmt(a.summary.max_temp_spread_c, '°C', 0)} sub={t('largest_temp_spread_sub')} />
      </div>
    </Section>
  );
}

function Derating({ derating }) {
  const { t } = useReport();
  const dis = derating.find((x) => x.type === 'discharge');
  const chg = derating.find((x) => x.type === 'charge');
  return (
    <Section title={t('derating')} subtitle={t('derating_sub')}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
        {[[t('discharging'), dis, C.s2], [t('charging'), chg, C.s1]].map(([title, d, color]) => (
          <div key={title}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{title}</div>
            {!d?.bands?.length ? <div style={{ color: C.muted, fontSize: 13 }}>{t('none_in_log')}</div> : (
              <>
                <div style={{ height: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.bands} margin={chartMargin}>
                      <CartesianGrid stroke={C.border} vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                      <YAxis tick={axisTick} axisLine={false} tickLine={false} width={50} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff0d' }} formatter={(v, _k, item) => [`${fmt(v, 'kW')} · ${fmt(item.payload.avg_a, 'A', 0)} · ${item.payload.samples}`, t('average')]} />
                      <Bar dataKey="avg_kw" fill={color} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table style={{ ...tableStyle, marginTop: 6 }}>
                  <thead><tr>{[t('col_temp'), t('col_avg_kw'), t('col_avg_a'), t('col_readings')].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>{d.bands.map((b) => (
                    <tr key={b.label} style={rowStyle}>
                      <td style={{ ...tdStyle, color: C.text }}>{b.label}</td><td style={tdStyle}>{fmt(b.avg_kw)}</td><td style={tdStyle}>{fmt(b.avg_a, '', 0)}</td><td style={tdStyle}>{b.samples}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function CellSection({ a }) {
  const { t, lang } = useReport();
  const e = a.extremes;
  const at = (x) => (x ? `${fmtDate(x.t, lang)} · SOC ${x.soc}% · ${t(`state_${x.state}`)}` : '');
  return (
    <Section title={t('cell_voltages')} subtitle={t('cell_voltages_sub', { n: a.cells.count })}>
      <ChartBox title={t('high_low_cell')} height={200}>
        <LineChart data={a.series} margin={chartMargin}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis {...timeAxis} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={50} domain={['dataMin - 0.02', 'dataMax + 0.02']} tickFormatter={(v) => v.toFixed(2)} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtDate(v, lang)} formatter={(v, name) => [fmt(v, 'V', 3), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
          <Line name={t('highest_cell')} type="monotone" dataKey="max_cell_v" stroke={C.s2} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line name={t('lowest_cell')} type="monotone" dataKey="min_cell_v" stroke={C.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartBox>
      <ChartBox title={t('cell_spread_mv')} height={150}>
        <AreaChart data={a.series} margin={chartMargin}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis {...timeAxis} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={50} />
          <ReferenceLine y={a.settings.thresholds.cell_spread_warn_v * 1000} stroke={C.amber} strokeDasharray="4 4" ifOverflow="extendDomain" />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtDate(v, lang)} formatter={(v) => [fmt(v, 'mV', 0), t('spread')]} />
          <Area type="monotone" dataKey="spread_mv" stroke={C.s3} strokeWidth={1.5} fill={C.s3} fillOpacity={0.18} isAnimationActive={false} />
        </AreaChart>
      </ChartBox>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
        <Fact label={t('highest_cell')} value={e.max_cell ? t('v_cell', { v: e.max_cell.value, c: e.max_cell.cell }) : '—'} sub={at(e.max_cell)} />
        <Fact label={t('lowest_cell')} value={e.min_cell ? t('v_cell', { v: e.min_cell.value, c: e.min_cell.cell }) : '—'} sub={at(e.min_cell)} />
        <Fact label={t('largest_spread')} value={e.max_spread ? `${e.max_spread.value_mv} mV` : '—'} sub={at(e.max_spread)} />
        <Fact label={t('balancing_active')} value={t('pct_readings', { p: a.cells.balancing_pct })} sub={t('balancing_sub')} />
      </div>
    </Section>
  );
}

function Outliers({ a }) {
  const { t } = useReport();
  return (
    <Section title={t('outliers')} subtitle={t('outliers_sub')}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
        <TableWrap>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{t('lowest_cells')}</div>
          <table style={tableStyle}>
            <thead><tr>{[t('col_cell'), t('col_vs_pack'), t('col_lowest_in'), t('col_range')].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{a.cells.weakest.map((c) => (
              <tr key={c.n} style={rowStyle}>
                <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>#{c.n}</td>
                <td style={tdStyle}>{fmt(c.avg_dev_mv, 'mV', 1)}</td>
                <td style={tdStyle}>{t('of_readings', { p: fmt(c.lowest_pct, '%', 1) })}</td>
                <td style={tdStyle}>{fmt(c.min_mv / 1000, 'V', 3)} – {fmt(c.max_mv / 1000, 'V', 3)}</td>
              </tr>
            ))}</tbody>
          </table>
        </TableWrap>
        <TableWrap>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{t('hottest_sensors')}</div>
          <table style={tableStyle}>
            <thead><tr>{[t('col_sensor'), t('col_vs_pack'), t('col_hottest_in'), t('col_max')].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{a.temps.hottest.map((s) => (
              <tr key={s.n} style={rowStyle}>
                <td style={{ ...tdStyle, color: C.text, fontWeight: 600 }}>#{s.n}</td>
                <td style={tdStyle}>+{fmt(s.avg_dev_c, '°C', 1)}</td>
                <td style={tdStyle}>{t('of_readings', { p: fmt(s.hottest_pct, '%', 1) })}</td>
                <td style={tdStyle}>{fmt(s.max_c, '°C', 0)}</td>
              </tr>
            ))}</tbody>
          </table>
        </TableWrap>
      </div>
    </Section>
  );
}

function Vehicles({ a, vehicle }) {
  const { t } = useReport();
  const L = a.settings.limits;
  const veh = vehicle || L.vehicle_name;
  return (
    <Section title={t('vehicles')} subtitle={t('vehicles_sub', { kwh: L.vehicle_session_kwh, veh })}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Tile label={t('veh_charges', { veh })} value={fmt(a.summary.vehicle_sessions_est)} />
        <Tile label={t('discharge_sessions')} value={a.events.filter((e) => e.type === 'discharge').length} />
        <Tile label={t('energy_delivered')} value={fmt(a.summary.discharge_kwh)} unit="kWh" />
        <Tile label={t('average_output')} value={fmt(a.summary.avg_discharge_kw)} unit="kW" />
      </div>
    </Section>
  );
}

function Energy({ s }) {
  const { t } = useReport();
  return (
    <Section title={t('lifetime')} subtitle={t('lifetime_sub')}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Tile label={t('lifetime_dis')} value={fmt(s.lifetime_discharge_kwh != null ? s.lifetime_discharge_kwh / 1000 : null, '', 1)} unit="MWh" />
        <Tile label={t('lifetime_chg')} value={fmt(s.lifetime_charge_kwh != null ? s.lifetime_charge_kwh / 1000 : null, '', 1)} unit="MWh" />
        <Tile label={t('full_cycles')} value={fmt(s.equivalent_full_cycles, '', 0)} sub={s.nominal_kwh ? t('per_cycle', { kwh: fmt(s.nominal_kwh, 'kWh') }) : ''} />
        <Tile label={t('dis_counter')} value={fmt(s.period_discharge_kwh)} unit="kWh" sub={t('calculated', { v: fmt(s.discharge_kwh, 'kWh') })} />
        <Tile label={t('chg_counter')} value={fmt(s.period_charge_kwh)} unit="kWh" sub={t('calculated', { v: fmt(s.charge_kwh, 'kWh') })} />
        <Tile label={t('chg_over_dis')} value={s.lifetime_discharge_kwh ? fmt((s.lifetime_charge_kwh / s.lifetime_discharge_kwh) * 100, '', 1) : '—'} unit="%" sub={t('chg_over_dis_sub')} />
      </div>
    </Section>
  );
}

function Insulation({ a }) {
  const { t, lang } = useReport();
  const e = a.extremes.min_insulation;
  const s = a.summary;
  const T = a.settings.thresholds;
  return (
    <Section title={t('insulation')} subtitle={t('insulation_sub', { w: T.insulation_warn_ohm_per_v, c: T.insulation_crit_ohm_per_v })}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Fact label={t('lowest_insulation')} value={e?.value_kohm != null ? `${fmt(e.value_kohm, 'kΩ', 0)} (${fmt(e.ohm_per_v, 'Ω/V', 0)})` : t('above_range')} sub={e?.t ? `${fmtDate(e.t, lang)} · ${t(`state_${e.state}`)}` : ''} />
        <Fact label={t('lowest_supply')} value={fmt(s.min_supply_v, 'V', 2)} sub={t('warn_below', { v: T.supply_low_v })} />
      </div>
    </Section>
  );
}

function Faults({ a }) {
  const { t, lang } = useReport();
  return (
    <Section title={t('faults')}>
      {a.faults.length === 0 && !a.summary.snapshot_rows ? (
        <div style={{ color: C.green, fontSize: 13 }}>{t('faults_none')}</div>
      ) : (
        <>
          {a.summary.snapshot_rows > 0 && <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>{t('snapshot_rows', { n: a.summary.snapshot_rows })}</div>}
          <TableWrap>
            <table style={tableStyle}>
              <thead><tr>{[t('col_fault'), t('col_code'), t('col_level'), t('col_first_seen'), t('col_readings'), 'SOC'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>{a.faults.map((f, k) => (
                <tr key={k} style={rowStyle}>
                  <td style={{ ...tdStyle, color: C.text }}>{f.name || '—'}</td><td style={tdStyle}>{f.code || '—'}</td><td style={tdStyle}>{f.level || '—'}</td>
                  <td style={tdStyle}>{fmtDate(f.first_t, lang)}</td><td style={tdStyle}>{f.samples}</td><td style={tdStyle}>{fmt(f.soc, '%', 0)}</td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
        </>
      )}
    </Section>
  );
}

function Gaps({ gaps }) {
  const { t, lang } = useReport();
  return (
    <Section title={t('gaps')} subtitle={t('gaps_sub')}>
      {gaps.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>{t('gaps_none')}</div> : (
        <TableWrap>
          <table style={tableStyle}>
            <thead><tr>{[t('col_from'), t('col_to'), t('col_length'), t('col_soc_change')].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{gaps.map((g, k) => (
              <tr key={k} style={rowStyle}>
                <td style={tdStyle}>{fmtDate(g.from, lang)}</td><td style={tdStyle}>{fmtDate(g.to, lang)}</td><td style={tdStyle}>{fmtMin(g.minutes)}</td>
                <td style={tdStyle}>{fmt(g.soc_before, '%', 0)} → {fmt(g.soc_after, '%', 0)}</td>
              </tr>
            ))}</tbody>
          </table>
        </TableWrap>
      )}
    </Section>
  );
}

// --- Markdown (Claude's replies) ---------------------------------------------------
// Small, safe renderer: headings, bullet / numbered lists, **bold**, `code`,
// paragraphs. Builds React elements — no raw HTML is ever injected.

function inline(text, keyBase) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${keyBase}-${k++}`} style={{ color: C.text }}>{tok.slice(2, -2)}</strong>);
    else out.push(<code key={`${keyBase}-${k++}`} style={{ background: C.bg, borderRadius: 4, padding: '1px 5px', fontSize: '0.92em' }}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (h) { flushPara(); flushList(); blocks.push({ type: 'h', level: h[1].length, text: h[2] }); continue; }
    if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (!list || list.type !== kind) { flushList(); list = { type: kind, items: [] }; }
      list.items.push(ul ? ul[1] : ol[2]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();

  return (
    <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          const size = b.level <= 2 ? 15 : 14;
          return <div key={i} style={{ fontSize: size, fontWeight: 700, margin: i ? '14px 0 6px' : '0 0 6px' }}>{inline(b.text, i)}</div>;
        }
        if (b.type === 'ul' || b.type === 'ol') {
          const Tag = b.type;
          return (
            <Tag key={i} style={{ margin: '4px 0 8px', paddingLeft: 22, listStyleType: b.type === 'ol' ? 'decimal' : 'disc' }}>
              {b.items.map((it, j) => <li key={j} style={{ margin: '2px 0' }}>{inline(it, `${i}-${j}`)}</li>)}
            </Tag>
          );
        }
        return <p key={i} style={{ margin: '0 0 8px' }}>{inline(b.text, i)}</p>;
      })}
    </div>
  );
}

// --- small pieces -------------------------------------------------------------------

export function Section({ title, subtitle, actions, children }) {
  return (
    <div className="bms-section" style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
        {actions}
      </div>
      {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 3, marginBottom: 12, lineHeight: 1.45 }}>{subtitle}</div>}
      {!subtitle && <div style={{ height: 12 }} />}
      {children}
    </div>
  );
}

function TableWrap({ children }) {
  const { print } = useReport();
  return <div style={{ overflowX: print ? 'visible' : 'auto' }}>{children}</div>;
}

function ChartBox({ title, height, children }) {
  return (
    <div style={{ marginTop: 8, breakInside: 'avoid' }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{title}</div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

export function Tile({ label, value, unit, sub, accent }) {
  return (
    <div style={{ background: C.inner, borderRadius: 10, padding: '12px 14px', minWidth: 0, breakInside: 'avoid' }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
        {accent && <span style={{ width: 4, height: 16, borderRadius: 2, background: accent, flexShrink: 0 }} />}
        <span>{value}{unit && <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginLeft: 4 }}>{unit}</span>}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Fact({ label, value, sub }) {
  return (
    <div style={{ background: C.inner, borderRadius: 10, padding: '10px 14px', breakInside: 'avoid' }}>
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function TypePill({ type }) {
  const { t } = useReport();
  const dis = type === 'discharge';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: C.text }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: dis ? C.s2 : C.s1 }} />
      {t(dis ? 'type_discharge' : 'type_charge')}
    </span>
  );
}

export function WarningCounts({ w, big }) {
  const { t } = useReport();
  if (!w) return <span style={{ color: C.muted }}>—</span>;
  const items = [['critical', w.critical], ['warning', w.warning], ['info', w.info]].filter(([, c]) => c > 0);
  if (!items.length) return <span style={{ color: C.green, fontSize: big ? 16 : 12, fontWeight: 600 }}>{t('none')}</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map(([lvl, c]) => (
        <span key={lvl} title={t(`level_${lvl}`)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: big ? 14 : 11, fontWeight: 700, color: C.text,
          border: `1px solid ${LEVEL[lvl].color}66`, background: `${LEVEL[lvl].color}1a`, borderRadius: 999, padding: big ? '2px 10px' : '1px 7px',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: LEVEL[lvl].color }} />{c} {t(`level_${lvl}`).toLowerCase()}
        </span>
      ))}
    </span>
  );
}

