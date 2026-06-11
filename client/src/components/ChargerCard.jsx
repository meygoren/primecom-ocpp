import { useNavigate } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import { formatDistanceToNow } from '../lib/time';

export default function ChargerCard({ charger }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/charger/${encodeURIComponent(charger.charger_id)}`)}
      style={{
        background: '#1a1d27',
        border: '1px solid #2e3347',
        borderRadius: 12,
        padding: '20px 24px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#47a141')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2e3347')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9', marginBottom: 2 }}>
            {charger.charger_id}
          </div>
          <div style={{ fontSize: 12, color: '#8892a4' }}>
            {charger.location_label || 'No location set'}
          </div>
        </div>
        <StatusBadge status={charger.status} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <Stat label="Model" value={charger.model || '—'} />
        <Stat label="Firmware" value={charger.firmware_version || '—'} />
        <Stat
          label="Last Heartbeat"
          value={charger.last_heartbeat ? formatDistanceToNow(charger.last_heartbeat) : 'Never'}
        />
        <Stat label="Connectors" value={charger.connector_count ?? 1} />
      </div>

      {!charger.connected && charger.status !== 'offline' && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#f59e0b' }}>
          No active WebSocket connection
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8892a4', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 500 }}>{value}</div>
    </div>
  );
}
