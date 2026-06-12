import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function DriverDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [prefSaving, setPrefSaving] = useState(false);
  const [threshold, setThreshold] = useState(90);
  const [prefSaved, setPrefSaved] = useState(false);

  async function load() {
    try {
      const d = await api.getDriverView();
      setData(d);
      setThreshold(d.preferences?.soc_threshold ?? 90);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  async function markRead(id) {
    await api.markNotificationRead(id);
    setData((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
    }));
  }

  async function markAllRead() {
    await api.markAllRead();
    setData((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  }

  async function savePrefs() {
    setPrefSaving(true);
    setPrefSaved(false);
    try {
      await api.setNotificationPrefs({ soc_threshold: threshold });
      setPrefSaved(true);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setPrefSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '32px 36px', color: '#8892a4' }}>Loading...</div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px 36px', color: '#ef4444' }}>{error}</div>
    );
  }

  const { charger, session, soc, power, notifications, preferences } = data;
  const unread = notifications.filter((n) => !n.read).length;

  const statusColor = {
    online: '#47a141',
    charging: '#3b82f6',
    faulted: '#ef4444',
    offline: '#6b7280',
    preparing: '#f59e0b',
    finishing: '#f59e0b',
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 700 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>My Charger</h1>
        <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Refreshes every 30 seconds</div>
      </div>

      {/* Charger status card */}
      {!charger ? (
        <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: 40, textAlign: 'center', color: '#8892a4' }}>
          No charger assigned to your account yet. Contact your administrator.
        </div>
      ) : (
        <>
          <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{charger.charger_id}</div>
                {charger.location_label && (
                  <div style={{ fontSize: 13, color: '#8892a4', marginTop: 3 }}>{charger.location_label}</div>
                )}
              </div>
              <span style={{
                background: charger.status === 'online' ? '#1a3a1a' : charger.status === 'charging' ? '#1a2540' : charger.status === 'faulted' ? '#3f1515' : '#22263a',
                border: `1px solid ${statusColor[charger.status] || '#6b7280'}`,
                color: statusColor[charger.status] || '#6b7280',
                borderRadius: 999,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'capitalize',
              }}>
                {charger.status}
              </span>
            </div>

            {/* SOC bar */}
            {soc !== null && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#8892a4', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>State of Charge</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: soc >= (preferences?.soc_threshold ?? 90) ? '#47a141' : '#3b82f6' }}>{Math.round(soc)}%</span>
                </div>
                <div style={{ background: '#22263a', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(soc, 100)}%`,
                    background: soc >= (preferences?.soc_threshold ?? 90) ? '#47a141' : '#3b82f6',
                    borderRadius: 6,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Power */}
            {power && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#8892a4' }}>Power:</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                  {power.value} {power.unit || 'W'}
                </span>
              </div>
            )}

            {/* Session info */}
            {session && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #2e3347' }}>
                <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Active Session</div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#8892a4' }}>Transaction ID</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{session.transaction_id}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8892a4' }}>Started</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                      {new Date(session.start_time).toLocaleTimeString()}
                    </div>
                  </div>
                  {session.energy_kwh != null && (
                    <div>
                      <div style={{ fontSize: 11, color: '#8892a4' }}>Energy</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{session.energy_kwh} kWh</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!session && soc === null && (
              <div style={{ fontSize: 13, color: '#8892a4', marginTop: 8 }}>No active charging session.</div>
            )}
          </div>

          {/* Notifications */}
          <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #2e3347', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
                Notifications
                {unread > 0 && (
                  <span style={{ marginLeft: 8, background: '#47a141', color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{unread}</span>
                )}
              </div>
              {unread > 0 && (
                <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#47a141', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div style={{ padding: '24px 20px', color: '#8892a4', fontSize: 13 }}>No notifications yet.</div>
            ) : (
              <div>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid #2e3347',
                      background: n.read ? 'transparent' : '#1e2535',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 12,
                    }}
                  >
                    <div>
                      {!n.read && (
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#47a141', marginRight: 8, verticalAlign: 'middle', marginTop: -2 }} />
                      )}
                      <span style={{ fontSize: 13, color: '#f1f5f9' }}>{n.message}</span>
                      <div style={{ fontSize: 11, color: '#8892a4', marginTop: 3 }}>
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => markRead(n.id)}
                        style={{ background: 'none', border: '1px solid #2e3347', borderRadius: 5, padding: '3px 8px', color: '#8892a4', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preferences */}
          <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>Notification Settings</div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                SOC Alert Threshold
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={threshold}
                  onChange={(e) => { setThreshold(Number(e.target.value)); setPrefSaved(false); }}
                  style={{ flex: 1, accentColor: '#47a141' }}
                />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#47a141', minWidth: 48 }}>{threshold}%</span>
              </div>
              <div style={{ fontSize: 11, color: '#8892a4', marginTop: 4 }}>
                You will be notified when your charger reaches this charge level.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={savePrefs}
                disabled={prefSaving}
                style={{ background: prefSaving ? '#22263a' : '#47a141', border: 'none', borderRadius: 7, padding: '9px 20px', color: prefSaving ? '#8892a4' : '#fff', fontWeight: 700, fontSize: 13, cursor: prefSaving ? 'not-allowed' : 'pointer' }}
              >
                {prefSaving ? 'Saving...' : 'Save'}
              </button>
              {prefSaved && <span style={{ fontSize: 12, color: '#47a141', fontWeight: 600 }}>Saved</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
