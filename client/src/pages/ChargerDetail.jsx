import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import CommandPanel from '../components/CommandPanel';
import MeterChart from '../components/MeterChart';
import { formatDistanceToNow, formatDateTime } from '../lib/time';
import { ArrowLeft, Pencil, Check, X } from 'lucide-react';

export default function ChargerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [charger, setCharger] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [meterData, setMeterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  // Config tab state
  const [configData, setConfigData] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [changeResult, setChangeResult] = useState(null);

  // Firmware tab state
  const [fwUrl, setFwUrl] = useState('');
  const [fwDate, setFwDate] = useState('');
  const [fwSending, setFwSending] = useState(false);
  const [fwResult, setFwResult] = useState(null);
  const [fwError, setFwError] = useState(null);
  const [fwHistory, setFwHistory] = useState([]);
  const [fwHistoryLoading, setFwHistoryLoading] = useState(false);

  // Inline edit state for overview fields
  const [editingField, setEditingField] = useState(null);
  const [fieldValue, setFieldValue] = useState('');
  const [fieldSaving, setFieldSaving] = useState(false);

  // Feature flags
  const showConfigTab = localStorage.getItem('settings_feat_config_tab') !== 'false';
  const showFirmwareTab = localStorage.getItem('settings_feat_firmware_tab') !== 'false';
  const showNotesEdit = localStorage.getItem('settings_feat_notes_edit') !== 'false';

  async function load() {
    try {
      const [c, s] = await Promise.all([
        api.getCharger(id),
        api.getSessions({ charger_id: id, limit: 20 }),
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

  useEffect(() => {
    if (tab === 'firmware') {
      loadFirmwareHistory();
    }
  }, [tab]);

  async function loadFirmwareHistory() {
    setFwHistoryLoading(true);
    try {
      const data = await api.getFirmwareHistory(id);
      setFwHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setFwHistoryLoading(false);
    }
  }

  async function loadConfig() {
    setConfigLoading(true);
    setConfigError(null);
    setConfigData(null);
    try {
      const result = await api.sendCommand(id, 'get-configuration', {});
      const items = result?.result?.configurationKey || [];
      setConfigData(items);
    } catch (err) {
      setConfigError(err.message);
    } finally {
      setConfigLoading(false);
    }
  }

  async function saveConfigKey(key) {
    setChangeResult(null);
    try {
      const result = await api.sendCommand(id, 'change-configuration', { key, value: editValue });
      setChangeResult({ key, status: result?.result?.status || 'Accepted' });
      setEditingKey(null);
      // Refresh config
      loadConfig();
    } catch (err) {
      setChangeResult({ key, status: 'Error: ' + err.message });
    }
  }

  async function pushFirmware() {
    if (!fwUrl.trim()) return;
    setFwSending(true);
    setFwResult(null);
    setFwError(null);
    try {
      const body = { location: fwUrl.trim() };
      if (fwDate) body.retrieveDate = new Date(fwDate).toISOString();
      const result = await api.sendCommand(id, 'update-firmware', body);
      setFwResult(result?.result?.status || 'Accepted');
      loadFirmwareHistory();
    } catch (err) {
      setFwError(err.message);
    } finally {
      setFwSending(false);
    }
  }

  async function saveField(field) {
    setFieldSaving(true);
    try {
      const update = {};
      update[field] = fieldValue;
      const updated = await api.updateCharger(id, update);
      setCharger((prev) => ({ ...prev, ...updated }));
      setEditingField(null);
    } catch (err) {
      console.error(err);
    } finally {
      setFieldSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 40, color: '#8892a4' }}>Loading...</div>;
  if (!charger) return <div style={{ padding: 40, color: '#ef4444' }}>Charger not found</div>;

  const tabs = [
    'overview',
    'sessions',
    'meter',
    ...(showConfigTab ? ['config'] : []),
    ...(showFirmwareTab ? ['firmware'] : []),
  ];

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

              {/* Editable Location */}
              <EditableInfoCard
                label="Location"
                value={charger.location_label || '—'}
                field="location_label"
                editingField={editingField}
                fieldValue={fieldValue}
                fieldSaving={fieldSaving}
                showEdit={showNotesEdit}
                onStartEdit={(field, val) => { setEditingField(field); setFieldValue(val === '—' ? '' : val); }}
                onSave={saveField}
                onCancel={() => setEditingField(null)}
                onFieldValueChange={setFieldValue}
              />

              {/* Editable Notes */}
              <EditableInfoCard
                label="Notes"
                value={charger.notes || '—'}
                field="notes"
                cols={2}
                editingField={editingField}
                fieldValue={fieldValue}
                fieldSaving={fieldSaving}
                showEdit={showNotesEdit}
                onStartEdit={(field, val) => { setEditingField(field); setFieldValue(val === '—' ? '' : val); }}
                onSave={saveField}
                onCancel={() => setEditingField(null)}
                onFieldValueChange={setFieldValue}
              />
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

          {tab === 'config' && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <button
                  onClick={loadConfig}
                  disabled={configLoading}
                  style={{
                    background: configLoading ? '#22263a' : '#47a141',
                    border: 'none',
                    borderRadius: 8,
                    padding: '9px 20px',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: configLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {configLoading ? 'Loading...' : 'Load Configuration'}
                </button>
                {changeResult && (
                  <span style={{ marginLeft: 12, fontSize: 13, color: changeResult.status === 'Accepted' ? '#47a141' : '#f59e0b' }}>
                    {changeResult.key}: {changeResult.status}
                  </span>
                )}
              </div>

              {configError && (
                <div style={{ background: '#3f1515', border: '1px solid #ef4444', borderRadius: 8, padding: 14, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
                  {configError}
                </div>
              )}

              {configData && (
                <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2e3347' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Key</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Value</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>R/O</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {configData.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: '#8892a4' }}>No configuration keys returned</td></tr>
                      ) : configData.map((item) => (
                        <tr key={item.key} style={{ borderBottom: '1px solid #2e3347' }}>
                          <td style={{ padding: '10px 16px', color: '#f1f5f9', fontWeight: 500 }}>{item.key}</td>
                          <td style={{ padding: '10px 16px', color: '#8892a4' }}>
                            {editingKey === item.key ? (
                              <input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                style={{
                                  background: '#22263a',
                                  border: '1px solid #47a141',
                                  borderRadius: 5,
                                  padding: '4px 8px',
                                  color: '#f1f5f9',
                                  fontSize: 13,
                                  outline: 'none',
                                  width: '100%',
                                }}
                              />
                            ) : (
                              item.value ?? '—'
                            )}
                          </td>
                          <td style={{ padding: '10px 16px', color: item.readonly ? '#ef4444' : '#47a141', fontSize: 12 }}>
                            {item.readonly ? 'R/O' : 'R/W'}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            {!item.readonly && (
                              editingKey === item.key ? (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button
                                    onClick={() => saveConfigKey(item.key)}
                                    style={{ background: '#47a141', border: 'none', borderRadius: 5, padding: '4px 10px', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingKey(null)}
                                    style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 5, padding: '4px 10px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingKey(item.key); setEditValue(item.value ?? ''); }}
                                  style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 5, padding: '4px 10px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}
                                >
                                  Edit
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'firmware' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Push firmware form */}
              <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Push Firmware Update</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 5 }}>Firmware URL</label>
                    <input
                      type="text"
                      placeholder="https://firmware.example.com/v1.2.3.bin"
                      value={fwUrl}
                      onChange={(e) => setFwUrl(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#22263a',
                        border: '1px solid #2e3347',
                        borderRadius: 7,
                        padding: '8px 12px',
                        color: '#f1f5f9',
                        fontSize: 13,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 5 }}>Retrieve Date / Time (optional)</label>
                    <input
                      type="datetime-local"
                      value={fwDate}
                      onChange={(e) => setFwDate(e.target.value)}
                      style={{
                        background: '#22263a',
                        border: '1px solid #2e3347',
                        borderRadius: 7,
                        padding: '8px 12px',
                        color: '#f1f5f9',
                        fontSize: 13,
                        outline: 'none',
                        colorScheme: 'dark',
                      }}
                    />
                  </div>
                  <div>
                    <button
                      onClick={pushFirmware}
                      disabled={fwSending || !fwUrl.trim()}
                      style={{
                        background: fwSending || !fwUrl.trim() ? '#22263a' : '#47a141',
                        border: 'none',
                        borderRadius: 7,
                        padding: '9px 20px',
                        color: fwSending || !fwUrl.trim() ? '#8892a4' : '#fff',
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: fwSending || !fwUrl.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {fwSending ? 'Sending...' : 'Push Firmware'}
                    </button>
                  </div>
                  {fwResult && (
                    <div style={{ background: '#1a3a1a', border: '1px solid #47a141', borderRadius: 7, padding: '10px 14px', color: '#47a141', fontSize: 13 }}>
                      Result: {fwResult}
                    </div>
                  )}
                  {fwError && (
                    <div style={{ background: '#3f1515', border: '1px solid #ef4444', borderRadius: 7, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>
                      {fwError}
                    </div>
                  )}
                </div>
              </div>

              {/* Firmware history */}
              <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #2e3347', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                  Firmware Update History
                </div>
                {fwHistoryLoading ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#8892a4', fontSize: 13 }}>Loading history...</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2e3347' }}>
                        {['Requested', 'Status', 'URL', 'Notes'].map((h) => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fwHistory.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: '#8892a4' }}>No firmware updates yet</td></tr>
                      ) : fwHistory.map((fw) => {
                        const statusColor = fw.status === 'installed' ? '#47a141' : fw.status === 'failed' ? '#ef4444' : '#f59e0b';
                        return (
                          <tr key={fw.id} style={{ borderBottom: '1px solid #2e3347' }}>
                            <td style={{ padding: '10px 16px', color: '#8892a4' }}>{formatDateTime(fw.requested_at)}</td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ color: statusColor, fontWeight: 500, textTransform: 'capitalize' }}>{fw.status}</span>
                            </td>
                            <td style={{ padding: '10px 16px', color: '#8892a4', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <a href={fw.firmware_url} target="_blank" rel="noopener noreferrer" style={{ color: '#47a141', textDecoration: 'none' }}>
                                {fw.firmware_url}
                              </a>
                            </td>
                            <td style={{ padding: '10px 16px', color: '#8892a4' }}>{fw.notes || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
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

function EditableInfoCard({ label, value, field, cols, editingField, fieldValue, fieldSaving, showEdit, onStartEdit, onSave, onCancel, onFieldValueChange }) {
  const isEditing = editingField === field;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        {showEdit && !isEditing && (
          <button
            onClick={() => onStartEdit(field, value)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892a4', padding: 2, display: 'flex', alignItems: 'center' }}
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
      {isEditing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <input
            value={fieldValue}
            onChange={(e) => onFieldValueChange(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              background: '#22263a',
              border: '1px solid #47a141',
              borderRadius: 5,
              padding: '5px 8px',
              color: '#f1f5f9',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={() => onSave(field)}
            disabled={fieldSaving}
            style={{ background: '#47a141', border: 'none', borderRadius: 5, padding: '5px 8px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <Check size={12} />
          </button>
          <button
            onClick={onCancel}
            style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 5, padding: '5px 8px', color: '#8892a4', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 500 }}>{value}</div>
      )}
    </div>
  );
}
