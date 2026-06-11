import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import CommandPanel from '../components/CommandPanel';
import MeterChart from '../components/MeterChart';
import { formatDistanceToNow, formatDateTime } from '../lib/time';
import { ArrowLeft } from 'lucide-react';

export default function ChargerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [charger, setCharger] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [meterData, setMeterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  async function load() {
    try {
      const [c, s, m] = await Promise.all([
        api.getCharger(id),
        api.getSessions({ charger_id: id, limit: 20 }),
        api.getLogs({ charger_id: id, limit: 5 }),
      ]);
      setCharger(c);
      setSessions(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) return <div style={{ padding: 40, color: '#8892a4' }}>Loading...</div>;
  if (!charger) return <div style={{ padding: 40, color: '#ef4444' }}>Charger not found</div>;

  const tabs = ['overview', 'sessions', 'meter'];

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1280 }}>
      {/* Header */}
      <button
        onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', color: '#8892a4', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={14} /> Back to Dashboard
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{charger.charger_id}</h1>
            <StatusBadge status={charger.status} />
            {!charger.connected && (
              <span style={{ fontSize: 11, color: '#f59e0b', background: '#3f2a00', padding: '2px 8px', borderRadius: 999 }}>No WS connection</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#8892a4' }}>
            {charger.vendor} {charger.model} &bull; FW: {charger.firmware_version || '—'} &bull; {charger.location_label || 'No location'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #2e3347', paddingBottom: 0 }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === t ? '#47a141' : 'transparent'}`,
              color: tab === t ? '#47a141' : '#8892a4',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
              textTransform: 'capitalize',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
        {/* Main content */}
        <div>
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InfoCard label="Serial Number" value={charger.serial_number || '—'} />
              <InfoCard label="Firmware" value={charger.firmware_version || '—'} />
              <InfoCard label="Last Heartbeat" value={charger.last_heartbeat ? formatDistanceToNow(charger.last_heartbeat) : 'Never'} />
              <InfoCard label="Last Seen" value={charger.last_seen ? formatDateTime(charger.last_seen) : '—'} />
              <InfoCard label="Connectors" value={charger.connector_count ?? 1} />
              <InfoCard label="Location" value={charger.location_label || '—'} />
              {charger.notes && <InfoCard label="Notes" value={charger.notes} cols={2} />}
            </div>
          )}

          {tab === 'sessions' && (
            <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2e3347' }}>
                    {['Transaction', 'Connector', 'ID Tag', 'Start', 'Stop', 'kWh', 'Reason'].map((h) => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: '#8892a4' }}>No sessions yet</td></tr>
                  ) : sessions.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #2e3347' }}>
                      <td style={{ padding: '12px 16px', color: '#f1f5f9' }}>{s.transaction_id}</td>
                      <td style={{ padding: '12px 16px', color: '#f1f5f9' }}>{s.connector_id}</td>
                      <td style={{ padding: '12px 16px', color: '#f1f5f9' }}>{s.id_tag || '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#8892a4' }}>{formatDateTime(s.start_time)}</td>
                      <td style={{ padding: '12px 16px', color: '#8892a4' }}>{formatDateTime(s.stop_time)}</td>
                      <td style={{ padding: '12px 16px', color: '#47a141' }}>{s.energy_kwh != null ? `${s.energy_kwh} kWh` : '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#8892a4' }}>{s.stop_reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'meter' && (
            <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Power (W) — last 60 readings</div>
              <MeterChart data={meterData} measurand="Power.Active.Import" />
            </div>
          )}
        </div>

        {/* Command panel */}
        <div>
          <CommandPanel chargerId={charger.charger_id} />
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, cols }) {
  return (
    <div
      style={{
        background: '#1a1d27',
        border: '1px solid #2e3347',
        borderRadius: 10,
        padding: '14px 18px',
        gridColumn: cols ? `span ${cols}` : undefined,
      }}
    >
      <div style={{ fontSize: 11, color: '#8892a4', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 500 }}>{value}</div>
    </div>
  );
}
