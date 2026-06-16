import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

const POWER_KEYWORDS = ['power', 'current', 'voltage', 'ampere', 'amp', 'watt', 'kw', 'limit', 'max', 'charging'];

function isPowerKey(key) {
  const lower = key.toLowerCase();
  return POWER_KEYWORDS.some((kw) => lower.includes(kw));
}

export default function OcppConfig() {
  const profile = useProfile();
  const canEdit = profile?.role === 'admin' || profile?.role === 'operator';

  const [chargers, setChargers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saveResult, setSaveResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getChargers().then(setChargers).catch(() => {});
  }, []);

  async function loadConfig(chargerId) {
    if (!chargerId) return;
    setLoading(true);
    setError(null);
    setConfig(null);
    setEditingKey(null);
    setSaveResult(null);
    try {
      const result = await api.sendCommand(chargerId, 'get-configuration', {});
      const items = result?.result?.configurationKey || [];
      setConfig(items.sort((a, b) => a.key.localeCompare(b.key)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleChargerSelect(id) {
    setSelectedId(id);
    setConfig(null);
    setError(null);
    setSearch('');
    if (id) loadConfig(id);
  }

  async function saveKey(key) {
    setSaving(true);
    setSaveResult(null);
    try {
      const result = await api.sendCommand(selectedId, 'change-configuration', { key, value: editValue });
      const status = result?.result?.status || 'Accepted';
      setSaveResult({ key, status, ok: status === 'Accepted' });
      setEditingKey(null);
      // Refresh config after save
      await loadConfig(selectedId);
    } catch (err) {
      setSaveResult({ key, status: 'Error: ' + err.message, ok: false });
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    if (!config) return [];
    const q = search.toLowerCase();
    return config.filter((item) =>
      !q || item.key.toLowerCase().includes(q) || (item.value || '').toLowerCase().includes(q)
    );
  }, [config, search]);

  const powerKeys = useMemo(() => (config || []).filter((item) => isPowerKey(item.key)), [config]);

  const selectedCharger = chargers.find((c) => c.charger_id === selectedId);

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>OCPP Configuration</h1>
        <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>
          Read and change any OCPP configuration key on a connected charger
        </div>
      </div>

      {/* Charger selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{ flex: 1, maxWidth: 360 }}>
          <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 5 }}>Select Charger</label>
          <select
            value={selectedId}
            onChange={(e) => handleChargerSelect(e.target.value)}
            style={{
              width: '100%',
              background: '#22263a',
              border: '1px solid #2e3347',
              borderRadius: 8,
              padding: '9px 12px',
              color: selectedId ? '#f1f5f9' : '#8892a4',
              fontSize: 14,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">— Choose a charger —</option>
            {chargers.map((c) => (
              <option key={c.charger_id} value={c.charger_id}>
                {c.charger_id}{c.location_label ? ` — ${c.location_label}` : ''}
              </option>
            ))}
          </select>
        </div>
        {selectedId && (
          <div style={{ marginTop: 18 }}>
            <button
              onClick={() => loadConfig(selectedId)}
              disabled={loading}
              style={{
                background: loading ? '#22263a' : '#47a141',
                border: 'none',
                borderRadius: 8,
                padding: '9px 18px',
                color: loading ? '#8892a4' : '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Loading...' : 'Reload Config'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: '#3f1515', border: '1px solid #ef4444', borderRadius: 8, padding: 14, color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {saveResult && (
        <div style={{
          background: saveResult.ok ? '#1a3a1a' : '#3f1515',
          border: `1px solid ${saveResult.ok ? '#47a141' : '#ef4444'}`,
          borderRadius: 8, padding: '10px 14px',
          color: saveResult.ok ? '#47a141' : '#ef4444',
          fontSize: 13, marginBottom: 20,
        }}>
          <strong>{saveResult.key}</strong>: {saveResult.status}
        </div>
      )}

      {!selectedId && (
        <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '60px 40px', textAlign: 'center', color: '#8892a4' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Select a charger to view its configuration</div>
          <div style={{ fontSize: 13 }}>Configuration is fetched live from the charger via OCPP GetConfiguration</div>
        </div>
      )}

      {config && (
        <>
          {/* Power & Current Quick Access */}
          {powerKeys.length > 0 && (
            <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#47a141', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Power &amp; Current Controls
              </div>
              <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 16 }}>
                Keys matching power / current / voltage — edit these to limit charging speed
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {powerKeys.map((item) => (
                    <ConfigRow
                      key={item.key}
                      item={item}
                      canEdit={canEdit}
                      editingKey={editingKey}
                      editValue={editValue}
                      saving={saving}
                      onEdit={(key, val) => { setEditingKey(key); setEditValue(val ?? ''); setSaveResult(null); }}
                      onSave={saveKey}
                      onCancel={() => setEditingKey(null)}
                      onValueChange={setEditValue}
                      highlight
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Search */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Search configuration keys..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: '#22263a',
                border: '1px solid #2e3347',
                borderRadius: 8,
                padding: '9px 14px',
                color: '#f1f5f9',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Full key list */}
          <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2e3347', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                All Keys
              </span>
              <span style={{ fontSize: 12, color: '#8892a4' }}>
                {filtered.length} of {config.length} keys
                {selectedCharger && <span> &bull; {selectedCharger.charger_id}</span>}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2e3347' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12, width: '40%' }}>Key</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>Value</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', color: '#8892a4', fontWeight: 600, fontSize: 12, width: 60 }}>R/W</th>
                  <th style={{ padding: '10px 16px', width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: '#8892a4' }}>No keys match your search</td></tr>
                ) : filtered.map((item) => (
                  <ConfigRow
                    key={item.key}
                    item={item}
                    canEdit={canEdit}
                    editingKey={editingKey}
                    editValue={editValue}
                    saving={saving}
                    onEdit={(key, val) => { setEditingKey(key); setEditValue(val ?? ''); setSaveResult(null); }}
                    onSave={saveKey}
                    onCancel={() => setEditingKey(null)}
                    onValueChange={setEditValue}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ConfigRow({ item, canEdit, editingKey, editValue, saving, onEdit, onSave, onCancel, onValueChange, highlight }) {
  const isEditing = editingKey === item.key;
  const isReadOnly = item.readonly === true;

  return (
    <tr style={{ borderBottom: '1px solid #2e3347', background: highlight && isEditing ? '#1a2e1a' : undefined }}>
      <td style={{ padding: '10px 16px', color: '#f1f5f9', fontWeight: 500, verticalAlign: 'middle' }}>
        <span style={highlight ? { color: '#3b82f6', fontSize: 13 } : {}}>
          {item.key}
        </span>
      </td>
      <td style={{ padding: '10px 16px', color: '#8892a4', verticalAlign: 'middle' }}>
        {isEditing ? (
          <input
            value={editValue}
            onChange={(e) => onValueChange(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              background: '#22263a',
              border: '1px solid #47a141',
              borderRadius: 5,
              padding: '5px 8px',
              color: '#f1f5f9',
              fontSize: 13,
              outline: 'none',
            }}
          />
        ) : (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.value ?? '—'}</span>
        )}
      </td>
      <td style={{ padding: '10px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: isReadOnly ? '#ef444488' : '#47a141' }}>
          {isReadOnly ? 'R/O' : 'R/W'}
        </span>
      </td>
      <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
        {!isReadOnly && canEdit && (
          isEditing ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => onSave(item.key)}
                disabled={saving}
                style={{ background: '#47a141', border: 'none', borderRadius: 5, padding: '4px 12px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                {saving ? '...' : 'Save'}
              </button>
              <button
                onClick={onCancel}
                style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 5, padding: '4px 10px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => onEdit(item.key, item.value)}
              style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 5, padding: '4px 12px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}
            >
              Edit
            </button>
          )
        )}
      </td>
    </tr>
  );
}
