import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import ChargerCard from '../components/ChargerCard';

export default function Dashboard() {
  const [chargers, setChargers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const showFilter = localStorage.getItem('settings_feat_status_filter') !== 'false';

  async function load() {
    try {
      // getMyChargers returns all chargers for admins, assigned-only for regular users
      const data = await api.getMyChargers();
      setChargers(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const counts = {
    total: chargers.length,
    online: chargers.filter((c) => c.status === 'online').length,
    charging: chargers.filter((c) => c.status === 'charging').length,
    faulted: chargers.filter((c) => c.status === 'faulted').length,
    offline: chargers.filter((c) => c.status === 'offline').length,
  };

  const filteredChargers = statusFilter === 'all'
    ? chargers
    : chargers.filter((c) => c.status === statusFilter);

  if (loading) return <PageShell><div style={{ color: '#8892a4', padding: 40 }}>Loading chargers...</div></PageShell>;
  if (error) return <PageShell><div style={{ color: '#ef4444', padding: 40 }}>{error}</div></PageShell>;

  return (
    <PageShell>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Chargers" value={counts.total} color="#f1f5f9" />
        <StatCard label="Online" value={counts.online} color="#47a141" />
        <StatCard label="Charging" value={counts.charging} color="#3b82f6" />
        <StatCard label="Faulted" value={counts.faulted} color="#ef4444" />
      </div>

      {/* Status filter */}
      {showFilter && chargers.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: '#8892a4' }}>Filter:</span>
          {['all', 'online', 'charging', 'faulted', 'offline'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                background: statusFilter === s ? '#2d5c2a33' : '#22263a',
                border: `1px solid ${statusFilter === s ? '#47a141' : '#2e3347'}`,
                borderRadius: 6,
                padding: '5px 14px',
                color: statusFilter === s ? '#47a141' : '#8892a4',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s === 'all' ? `All (${counts.total})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s] ?? 0})`}
            </button>
          ))}
        </div>
      )}

      {chargers.length === 0 ? (
        <div
          style={{
            background: '#1a1d27',
            border: '1px solid #2e3347',
            borderRadius: 12,
            padding: '60px 40px',
            textAlign: 'center',
            color: '#8892a4',
          }}
        >
          <div style={{ fontSize: 16, marginBottom: 8 }}>No chargers connected yet</div>
          <div style={{ fontSize: 13 }}>
            Point your charger to:{' '}
            <code style={{ background: '#22263a', padding: '2px 8px', borderRadius: 4, color: '#47a141' }}>
              wss://primecom-ocpp-production.up.railway.app/ocpp/CHARGER-ID
            </code>
          </div>
        </div>
      ) : filteredChargers.length === 0 ? (
        <div
          style={{
            background: '#1a1d27',
            border: '1px solid #2e3347',
            borderRadius: 12,
            padding: '40px',
            textAlign: 'center',
            color: '#8892a4',
            fontSize: 14,
          }}
        >
          No chargers match the selected filter.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filteredChargers.map((c) => (
            <ChargerCard key={c.charger_id} charger={c} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function PageShell({ children }) {
  return (
    <div style={{ padding: '32px 36px', maxWidth: 1280 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Dashboard</h1>
        <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Live charger status — refreshes every 10 seconds</div>
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: '#1a1d27',
        border: '1px solid #2e3347',
        borderRadius: 12,
        padding: '20px 24px',
      }}
    >
      <div style={{ fontSize: 13, color: '#8892a4', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
