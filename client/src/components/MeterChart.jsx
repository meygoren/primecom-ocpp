import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function MeterChart({ data, measurand = 'Power.Active.Import' }) {
  const filtered = (data || [])
    .filter((d) => d.measurand === measurand)
    .slice(-60)
    .map((d) => ({
      time: new Date(d.timestamp).toLocaleTimeString(),
      value: parseFloat(d.value),
      unit: d.unit,
    }));

  if (!filtered.length) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: '#8892a4', fontSize: 13 }}>
        No meter data yet for this session
      </div>
    );
  }

  const unit = filtered[0]?.unit || '';

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={filtered}>
        <XAxis dataKey="time" tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} axisLine={false} unit={unit} />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8 }}
          labelStyle={{ color: '#8892a4' }}
          itemStyle={{ color: '#47a141' }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#47a141"
          strokeWidth={2}
          dot={false}
          name={measurand}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
