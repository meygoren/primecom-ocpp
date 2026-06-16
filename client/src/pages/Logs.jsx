import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/time';

export default function Logs() {
  const location = useLocation();
  const initialChargerId = new URLSearchParams(location.search).get('charger_id') || '';
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chargerId, setChargerId] = useState(initialChargerId);
  const [expanded, setExpanded] = useState(null);

  async function load() {
    try {
      const params = { limit: 100 };
      if (chargerId.trim()) params.charger_id = chargerId.trim();
      const data = await api.getLogs(params);
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [chargerId]);

  function dirColor(dir) {
    return dir === 'incoming' ? '#3b82f6' : '#47a141';
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1280 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>OCPP Logs</h1>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Raw message log — click a row to expand</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
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
          <button
            onClick={load}
            style={{
              background: '#22263a',
              border: '1px solid #2e3347',
              borderRadius: 8,
              padding: '8px 16px',
              color: '#f1f5f9',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8892a4' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2e3347' }}>
                {['Time', 'Charger', 'Direction', 'Action', 'Message ID'].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#8892a4' }}>No logs found</td></tr>
              ) : logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    style={{
                      borderBottom: expanded === log.id ? 'none' : '1px solid #2e3347',
                      cursor: 'pointer',
                      background: expanded === log.id ? '#22263a' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 16px', color: '#8892a4' }}>{formatDateTime(log.created_at)}</td>
                    <td style={{ padding: '10px 16px', color: '#47a141', fontWeight: 500 }}>{log.charger_id}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ color: dirColor(log.direction), background: `${dirColor(log.direction)}22`, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
                        {log.direction === 'incoming' ? 'IN' : 'OUT'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#f1f5f9', fontWeight: 500 }}>{log.action || '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#8892a4', fontFamily: 'monospace', fontSize: 11 }}>{log.message_id?.slice(0, 16)}...</td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={`${log.id}-expanded`} style={{ borderBottom: '1px solid #2e3347', background: '#22263a' }}>
                      <td colSpan={5} style={{ padding: '0 16px 16px' }}>
                        <pre style={{
                          margin: 0,
                          fontFamily: 'monospace',
                          fontSize: 12,
                          color: '#a3d9a0',
                          background: '#0f1117',
                          padding: 16,
                          borderRadius: 8,
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}>
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
