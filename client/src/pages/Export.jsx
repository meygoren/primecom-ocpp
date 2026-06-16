import { useState, useEffect } from 'react';
import { api } from '../lib/api';

const PRESETS = [
  { label: 'Last 24 hours', hours: 24 },
  { label: 'Last 7 days',   hours: 24 * 7 },
  { label: 'Last 30 days',  hours: 24 * 30 },
  { label: 'Custom range',  hours: null },
];

const DATA_TYPES = [
  {
    id: 'meter_values',
    label: 'Meter Values',
    description: 'All sensor readings: power, current, voltage, temperature, SoC, energy — one row per reading interval',
    hasMeasurands: true,
  },
  {
    id: 'sessions',
    label: 'Charging Sessions',
    description: 'Start/stop times, energy delivered (kWh), duration, ID tag, stop reason — one row per session',
    hasMeasurands: false,
  },
  {
    id: 'logs',
    label: 'OCPP Message Logs',
    description: 'Raw incoming and outgoing OCPP messages with full JSON payload — for deep diagnostics',
    hasMeasurands: false,
  },
];

function toISOLocal(dt) {
  if (!dt) return '';
  return new Date(dt).toISOString();
}

function presetRange(hours) {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Export() {
  const [chargers, setChargers]               = useState([]);
  const [selectedId, setSelectedId]           = useState('');
  const [preset, setPreset]                   = useState(PRESETS[2]); // Last 30 days
  const [customFrom, setCustomFrom]           = useState('');
  const [customTo, setCustomTo]               = useState('');
  const [dataType, setDataType]               = useState('meter_values');
  const [measurands, setMeasurands]           = useState([]);
  const [selectedMeasurands, setSelectedMeasurands] = useState([]);
  const [measurandsLoading, setMeasurandsLoading]   = useState(false);
  const [downloading, setDownloading]         = useState(false);
  const [error, setError]                     = useState(null);
  const [success, setSuccess]                 = useState(null);

  useEffect(() => {
    api.getChargers().then(setChargers).catch(() => {});
  }, []);

  function getRange() {
    if (preset.hours != null) return presetRange(preset.hours);
    return {
      from: customFrom ? new Date(customFrom).toISOString() : undefined,
      to:   customTo   ? new Date(customTo).toISOString()   : undefined,
    };
  }

  async function loadMeasurands() {
    if (!selectedId) return;
    setMeasurandsLoading(true);
    setMeasurands([]);
    setSelectedMeasurands([]);
    try {
      const { from, to } = getRange();
      const { measurands: list } = await api.getExportMeasurands(selectedId, from, to);
      setMeasurands(list);
      setSelectedMeasurands(list); // default: all selected
    } catch (err) {
      setError(err.message);
    } finally {
      setMeasurandsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedId && dataType === 'meter_values') loadMeasurands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, dataType]);

  function toggleMeasurand(m) {
    setSelectedMeasurands((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  }

  function toggleAll() {
    setSelectedMeasurands(selectedMeasurands.length === measurands.length ? [] : [...measurands]);
  }

  async function doExport() {
    if (!selectedId) return;
    setDownloading(true);
    setError(null);
    setSuccess(null);
    try {
      const { from, to } = getRange();
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to)   params.set('to', to);

      let path = `/api/export/${encodeURIComponent(selectedId)}/${dataType.replace('_', '-')}`;
      if (dataType === 'meter_values' && selectedMeasurands.length < measurands.length) {
        params.set('measurands', selectedMeasurands.join(','));
      }
      const qs = params.toString();
      if (qs) path += '?' + qs;

      const { blob, filename } = await api.downloadExport(path);
      triggerDownload(blob, filename);
      setSuccess(`Downloaded ${filename}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  const canExport = selectedId && (dataType !== 'meter_values' || selectedMeasurands.length > 0);
  const currentType = DATA_TYPES.find((t) => t.id === dataType);

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Data Export</h1>
        <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>
          Export raw charger data to CSV — opens directly in Excel or Google Sheets
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Step 1: Charger */}
        <Card label="1. Select Charger">
          <select
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setMeasurands([]); setError(null); }}
            style={selectStyle}
          >
            <option value="">— Choose a charger —</option>
            {chargers.map((c) => (
              <option key={c.charger_id} value={c.charger_id}>
                {c.charger_id}{c.location_label ? ` — ${c.location_label}` : ''}
              </option>
            ))}
          </select>
        </Card>

        {/* Step 2: Date Range */}
        <Card label="2. Date Range">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPreset(p)}
                style={{
                  background: preset.label === p.label ? '#2d5c2a33' : '#22263a',
                  border: `1px solid ${preset.label === p.label ? '#47a141' : '#2e3347'}`,
                  borderRadius: 6,
                  padding: '6px 14px',
                  color: preset.label === p.label ? '#47a141' : '#8892a4',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset.hours === null && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label style={labelStyle}>From</label>
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label style={labelStyle}>To</label>
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </div>
            </div>
          )}

          {preset.hours !== null && (
            <div style={{ fontSize: 12, color: '#8892a4' }}>
              {(() => {
                const { from, to } = presetRange(preset.hours);
                return `${new Date(from).toLocaleString()} → ${new Date(to).toLocaleString()}`;
              })()}
            </div>
          )}
        </Card>

        {/* Step 3: Data Type */}
        <Card label="3. Data Type">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DATA_TYPES.map((t) => (
              <label
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 14px',
                  background: dataType === t.id ? '#1a2e1a' : '#22263a',
                  border: `1px solid ${dataType === t.id ? '#47a141' : '#2e3347'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="dataType"
                  value={t.id}
                  checked={dataType === t.id}
                  onChange={() => setDataType(t.id)}
                  style={{ marginTop: 2, accentColor: '#47a141' }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 3 }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: '#8892a4', lineHeight: 1.5 }}>{t.description}</div>
                </div>
              </label>
            ))}
          </div>
        </Card>

        {/* Step 4: Measurands (only for meter values) */}
        {dataType === 'meter_values' && selectedId && (
          <Card label="4. Select Measurands (Sensor Columns)">
            {measurandsLoading && (
              <div style={{ color: '#8892a4', fontSize: 13 }}>Loading available measurands...</div>
            )}
            {!measurandsLoading && measurands.length === 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ color: '#8892a4', fontSize: 13 }}>No meter data found for this charger in the selected range.</div>
                <button onClick={loadMeasurands} style={btnSecondary}>Retry</button>
              </div>
            )}
            {!measurandsLoading && measurands.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <button onClick={toggleAll} style={btnSecondary}>
                    {selectedMeasurands.length === measurands.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span style={{ fontSize: 12, color: '#8892a4' }}>
                    {selectedMeasurands.length} of {measurands.length} selected
                  </span>
                  <button onClick={loadMeasurands} style={{ ...btnSecondary, marginLeft: 'auto' }}>
                    Refresh list
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
                  {measurands.map((m) => (
                    <label
                      key={m}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 10px',
                        background: selectedMeasurands.includes(m) ? '#1a2e1a' : '#22263a',
                        border: `1px solid ${selectedMeasurands.includes(m) ? '#47a14166' : '#2e3347'}`,
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        color: selectedMeasurands.includes(m) ? '#a3d9a0' : '#8892a4',
                        fontFamily: 'monospace',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMeasurands.includes(m)}
                        onChange={() => toggleMeasurand(m)}
                        style={{ accentColor: '#47a141' }}
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}

        {/* Export Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && (
            <div style={{ background: '#3f1515', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ background: '#1a3a1a', border: '1px solid #47a141', borderRadius: 8, padding: '10px 14px', color: '#47a141', fontSize: 13 }}>
              {success}
            </div>
          )}
          <button
            onClick={doExport}
            disabled={!canExport || downloading}
            style={{
              background: !canExport || downloading ? '#22263a' : '#47a141',
              border: 'none',
              borderRadius: 8,
              padding: '12px 28px',
              color: !canExport || downloading ? '#8892a4' : '#fff',
              fontWeight: 700,
              fontSize: 15,
              cursor: !canExport || downloading ? 'not-allowed' : 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            {downloading ? 'Preparing download...' : `Export ${currentType?.label ?? ''} as CSV`}
          </button>
          <div style={{ fontSize: 12, color: '#8892a4' }}>
            CSV files open directly in Microsoft Excel and Google Sheets (File → Import)
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ label, children }) {
  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const selectStyle = {
  width: '100%',
  maxWidth: 420,
  background: '#22263a',
  border: '1px solid #2e3347',
  borderRadius: 8,
  padding: '9px 12px',
  color: '#f1f5f9',
  fontSize: 14,
  outline: 'none',
  cursor: 'pointer',
};

const inputStyle = {
  background: '#22263a',
  border: '1px solid #2e3347',
  borderRadius: 7,
  padding: '8px 12px',
  color: '#f1f5f9',
  fontSize: 13,
  outline: 'none',
};

const labelStyle = {
  fontSize: 12,
  color: '#8892a4',
  display: 'block',
  marginBottom: 5,
};

const btnSecondary = {
  background: '#22263a',
  border: '1px solid #2e3347',
  borderRadius: 6,
  padding: '6px 12px',
  color: '#8892a4',
  fontSize: 12,
  cursor: 'pointer',
};
