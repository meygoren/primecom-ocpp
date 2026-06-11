import { useState } from 'react';
import { api } from '../lib/api';

const COMMANDS = [
  { key: 'reset', label: 'Reboot', description: 'Send a Soft reset to the charger', fields: [] },
  {
    key: 'remote-start',
    label: 'Remote Start',
    description: 'Start a charging session',
    fields: [
      { name: 'connectorId', label: 'Connector ID', default: '1', type: 'number' },
      { name: 'idTag', label: 'ID Tag', default: 'PRIMECOM', type: 'text' },
    ],
  },
  {
    key: 'remote-stop',
    label: 'Remote Stop',
    description: 'Stop a charging session',
    fields: [{ name: 'transactionId', label: 'Transaction ID', default: '', type: 'number' }],
  },
  {
    key: 'get-configuration',
    label: 'Get Config',
    description: 'Read all configuration keys',
    fields: [],
  },
  {
    key: 'update-firmware',
    label: 'Push Firmware',
    description: 'Send a firmware update URL',
    fields: [{ name: 'location', label: 'Firmware URL', default: '', type: 'text' }],
  },
];

export default function CommandPanel({ chargerId }) {
  const [active, setActive] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function openCommand(cmd) {
    const defaults = {};
    cmd.fields.forEach((f) => (defaults[f.name] = f.default));
    setValues(defaults);
    setActive(cmd);
    setResult(null);
    setError(null);
  }

  async function send() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const body = {};
      active.fields.forEach((f) => {
        body[f.name] = f.type === 'number' ? parseInt(values[f.name]) : values[f.name];
      });
      const data = await api.sendCommand(chargerId, active.key, body);
      setResult(data.result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: '#1a1d27',
        border: '1px solid #2e3347',
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Commands
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.key}
            onClick={() => openCommand(cmd)}
            style={{
              background: active?.key === cmd.key ? '#2d5c2a33' : '#22263a',
              border: `1px solid ${active?.key === cmd.key ? '#47a141' : '#2e3347'}`,
              borderRadius: 8,
              padding: '10px 14px',
              cursor: 'pointer',
              textAlign: 'left',
              color: '#f1f5f9',
              fontSize: 14,
              fontWeight: 500,
              transition: 'all 0.15s',
            }}
          >
            {cmd.label}
            <div style={{ fontSize: 11, color: '#8892a4', marginTop: 2 }}>{cmd.description}</div>
          </button>
        ))}
      </div>

      {active && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: '#22263a',
            borderRadius: 8,
            border: '1px solid #2e3347',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 12 }}>
            {active.label}
          </div>

          {active.fields.map((f) => (
            <div key={f.name} style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>
                {f.label}
              </label>
              <input
                type={f.type}
                value={values[f.name] || ''}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                style={{
                  width: '100%',
                  background: '#1a1d27',
                  border: '1px solid #2e3347',
                  borderRadius: 6,
                  padding: '7px 10px',
                  color: '#f1f5f9',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
          ))}

          <button
            onClick={send}
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#2d5c2a' : '#47a141',
              border: 'none',
              borderRadius: 6,
              padding: '9px 0',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 4,
            }}
          >
            {loading ? 'Sending...' : `Send ${active.label}`}
          </button>

          {error && (
            <div style={{ marginTop: 10, padding: 10, background: '#3f1515', borderRadius: 6, fontSize: 12, color: '#ef4444' }}>
              {error}
            </div>
          )}

          {result !== null && (
            <div style={{ marginTop: 10, padding: 10, background: '#1a3a1a', borderRadius: 6, fontSize: 12, color: '#47a141' }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Response:</div>
              <pre style={{ margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#a3d9a0' }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
