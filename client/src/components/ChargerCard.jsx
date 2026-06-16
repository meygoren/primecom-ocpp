import { useNavigate } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import { formatDistanceToNow } from '../lib/time';

const MAX_KW = 150;
const GLOW_STYLE = '0 0 0 1px #47a141, 0 0 18px #47a14144, 0 0 36px #47a14122';

function calcHealthScore(charger) {
  let score = 100;
  if (charger.status === 'offline') score -= 20;
  if (charger.status === 'faulted') score -= 30;
  if (!charger.last_heartbeat) {
    score -= 10;
  } else {
    const diffMs = Date.now() - new Date(charger.last_heartbeat).getTime();
    if (diffMs > 5 * 60 * 1000) score -= 10;
  }
  return Math.max(0, score);
}

function ConnectorBar({ connector }) {
  const label = `Conn ${connector.connector_id}`;
  const pct = connector.power_kw != null ? Math.min(100, (connector.power_kw / MAX_KW) * 100) : 0;
  const kwText = connector.power_kw != null ? `${connector.power_kw.toFixed(1)} kW` : '— kW';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: '#8892a4' }}>{label}</span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {connector.temperature != null && (
            <span style={{ fontSize: 11, color: '#f59e0b' }}>{Math.round(connector.temperature)}°C</span>
          )}
          <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>{kwText}</span>
        </span>
      </div>
      <div style={{ background: '#22263a', borderRadius: 3, height: 5, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: pct > 0 ? 'linear-gradient(90deg, #2563eb, #60a5fa)' : 'transparent',
            borderRadius: 3,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: '#8892a4', textAlign: 'right', marginTop: 2 }}>
        / {MAX_KW} kW max
      </div>
    </div>
  );
}

export default function ChargerCard({ charger }) {
  const navigate = useNavigate();
  const showHealth = localStorage.getItem('settings_feat_health_score') !== 'false';
  const health = calcHealthScore(charger);
  const healthColor = health >= 80 ? '#47a141' : health >= 50 ? '#f59e0b' : '#ef4444';
  const isCharging = charger.status === 'charging';
  const connectors = charger.connectors_live || [];

  return (
    <div
      onClick={() => navigate(`/charger/${encodeURIComponent(charger.charger_id)}`)}
      style={{
        background: '#1a1d27',
        border: `1px solid ${isCharging ? '#47a141' : '#2e3347'}`,
        borderRadius: 12,
        padding: '20px 24px',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, border-color 0.15s',
        boxShadow: isCharging ? GLOW_STYLE : 'none',
      }}
      onMouseEnter={(e) => {
        if (!isCharging) e.currentTarget.style.borderColor = '#47a141';
      }}
      onMouseLeave={(e) => {
        if (!isCharging) e.currentTarget.style.borderColor = '#2e3347';
      }}
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
        {showHealth ? (
          <Stat label="Health" value={`${health}%`} valueColor={healthColor} />
        ) : (
          <Stat label="Connectors" value={charger.connector_count ?? 1} />
        )}
      </div>

      {/* Per-connector power bars (only shown when actively charging) */}
      {connectors.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #2e3347', paddingTop: 12 }}>
          {connectors.map((c) => (
            <ConnectorBar key={c.connector_id} connector={c} />
          ))}
        </div>
      )}

      {!charger.connected && charger.status !== 'offline' && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#f59e0b' }}>
          No active WebSocket connection
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, valueColor }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8892a4', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: valueColor || '#f1f5f9', fontWeight: 500 }}>{value}</div>
    </div>
  );
}
