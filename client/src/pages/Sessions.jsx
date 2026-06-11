import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatDateTime, formatDuration } from '../lib/time';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chargerId, setChargerId] = useState('');

  async function load() {
    try {
      const params = { limit: 100 };
      if (chargerId.trim()) params.charger_id = chargerId.trim();
      const data = await api.getSessions(params);
      setSessions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [chargerId]);

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1280 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Sessions</h1>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Charging session history</div>
        </div>
        <input
          placeholder="Filter by charger ID"
          value={chargerId}
          onChange={(e) => setChargerId(e.target.value)}
          style={{
            background: '#1a1d27',
            border: '1px solid #2e3347',
            borderRadius: 8,
            padding: '8px 14px',
            color: '#f1f5f9',
            fontSize: 13,
            width: 220,
            outline: 'none',
          }}
        />
      </div>

      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#8892a4' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2e3347' }}>
                {['Charger', 'Transaction', 'Connector', 'ID Tag', 'Start', 'Duration', 'kWh', 'Stop Reason'].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#8892a4' }}>No sessions found</td></tr>
              ) : sessions.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #2e3347' }}>
                  <td style={{ padding: '12px 16px', color: '#47a141', fontWeight: 500 }}>{s.charger_id}</td>
                  <td style={{ padding: '12px 16px', color: '#f1f5f9' }}>{s.transaction_id}</td>
                  <td style={{ padding: '12px 16px', color: '#f1f5f9' }}>{s.connector_id}</td>
                  <td style={{ padding: '12px 16px', color: '#f1f5f9' }}>{s.id_tag || '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#8892a4' }}>{formatDateTime(s.start_time)}</td>
                  <td style={{ padding: '12px 16px', color: '#f1f5f9' }}>{formatDuration(s.start_time, s.stop_time)}</td>
                  <td style={{ padding: '12px 16px', color: '#47a141' }}>{s.energy_kwh != null ? `${s.energy_kwh}` : '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#8892a4' }}>{s.stop_reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
