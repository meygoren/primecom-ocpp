import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, Truck, Users, Plus, Trash2, Bell, BellOff, Send, Save, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

const STATUS_COLOR  = { online: '#47a141', charging: '#3b82f6', faulted: '#ef4444', offline: '#6b7280' };
const STATUS_BG     = { online: '#1a3a1a', charging: '#1a2540', faulted: '#3f1515', offline: '#22263a' };

// ─── helpers ──────────────────────────────────────────────────────────────────

function truckStatus(live) {
  const units = [live?.passenger?.unit_1, live?.passenger?.unit_2, live?.driver?.unit_1, live?.driver?.unit_2];
  if (units.some((u) => u?.status === 'charging'))  return 'charging';
  if (units.some((u) => u?.status === 'faulted'))   return 'faulted';
  if (units.some((u) => u?.status === 'online'))    return 'online';
  return 'offline';
}

function sideSoc(live, side) {
  const socs = [live?.[side]?.unit_1?.soc, live?.[side]?.unit_2?.soc].filter((v) => v != null);
  return socs.length ? socs.reduce((a, b) => a + b, 0) / socs.length : null;
}

function sidePower(live, side) {
  return (live?.[side]?.unit_1?.power_kw || 0) + (live?.[side]?.unit_2?.power_kw || 0);
}

// ─── SocBar ───────────────────────────────────────────────────────────────────

function SocBar({ soc }) {
  const color = soc == null ? '#6b7280' : soc >= 80 ? '#47a141' : soc >= 20 ? '#3b82f6' : '#f59e0b';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: '#8892a4' }}>SOC</span>
        <span style={{ fontSize: 22, fontWeight: 700, color }}>{soc != null ? `${Math.round(soc)}%` : '—'}</span>
      </div>
      <div style={{ background: '#22263a', borderRadius: 5, height: 10 }}>
        <div style={{ height: '100%', width: `${Math.min(soc ?? 0, 100)}%`, background: color, borderRadius: 5, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

// ─── SidePanel ────────────────────────────────────────────────────────────────

function SidePanel({ truck, side, label }) {
  const isCompact = truck.truck_type === 'compact';
  const pfx = side === 'passenger' ? 'p' : 'd';
  const configured = !!truck[`${pfx}_ocpp_1`];
  const unit1 = truck.live?.[side]?.unit_1;
  const unit2 = truck.live?.[side]?.unit_2;
  const soc   = sideSoc(truck.live, side);
  const power = sidePower(truck.live, side);

  // cables: unit1 = A,B (connectors 1,2); unit2 = C,D (connectors 1,2)
  const cables = [
    { label: 'A', unit: unit1, conn: 1 },
    { label: 'B', unit: unit1, conn: 2 },
    ...(isCompact ? [] : [
      { label: 'C', unit: unit2, conn: 1 },
      { label: 'D', unit: unit2, conn: 2 },
    ]),
  ];

  return (
    <div style={{ padding: '16px 18px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>
        {label} Side
      </div>

      {!configured ? (
        <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', paddingTop: 6 }}>
          Not configured — set OCPP IDs in Settings
        </div>
      ) : (
        <>
          <SocBar soc={soc} />

          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: power > 0 ? '#f1f5f9' : '#6b7280' }}>
            {power > 0 ? `${power.toFixed(1)} kW` : 'No output'}
          </div>

          <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
            {cables.map((c) => {
              const active  = c.unit?.connectors?.find((x) => x.connector_id === c.conn)?.active;
              const status  = c.unit?.status;
              const color   = active ? '#3b82f6' : status === 'faulted' ? '#ef4444' : status === 'online' ? '#47a141' : '#6b7280';
              const bg      = active ? '#1a2540' : STATUS_BG[status] || '#22263a';
              return (
                <div
                  key={c.label}
                  title={`Cable ${c.label}: ${active ? 'Active session' : status || 'offline'}`}
                  style={{
                    width: 30, height: 30, borderRadius: 6, background: bg, border: `1px solid ${color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color,
                  }}
                >
                  {c.label}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── TruckCard ────────────────────────────────────────────────────────────────

function TruckCard({ truck }) {
  const status = truckStatus(truck.live);
  const borderColor = STATUS_COLOR[status] + '55';

  return (
    <div style={{ background: '#1a1d27', border: `1px solid ${borderColor}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #2e3347', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{truck.label || `Truck ${truck.truck_number}`}</div>
          <div style={{ fontSize: 11, color: '#8892a4', marginTop: 2 }}>
            {truck.truck_type === 'compact' ? '4-cable · 2 boards' : '8-cable · 4 boards'} · 450 kWh
          </div>
        </div>
        <span style={{ background: STATUS_BG[status], border: `1px solid ${STATUS_COLOR[status]}`, color: STATUS_COLOR[status], borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
          {status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <SidePanel truck={truck} side="passenger" label="Passenger" />
        <div style={{ borderLeft: '1px solid #2e3347' }}>
          <SidePanel truck={truck} side="driver" label="Driver" />
        </div>
      </div>
    </div>
  );
}

// ─── SettingsTab ──────────────────────────────────────────────────────────────

function SettingsTab({ trucks, onRefresh }) {
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving]     = useState(null);
  const [form, setForm]         = useState({});

  const [supervisors, setSupervisors]   = useState([]);
  const [loadingSup, setLoadingSup]     = useState(true);
  const [newSup, setNewSup]             = useState({ name: '', phone: '', email: '' });
  const [addingSup, setAddingSup]       = useState(false);

  const [alertsEnabled, setAlertsEnabled]   = useState(true);
  const [customMessage, setCustomMessage]   = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved]   = useState(false);
  const [testingSms, setTestingSms]         = useState(false);
  const [testResult, setTestResult]         = useState(null);
  const [settingsSubTab, setSettingsSubTab] = useState('trucks');

  const [scheduleEditing, setScheduleEditing] = useState(null);
  const [scheduleForm, setScheduleForm]       = useState({ days: [], start: '', end: '' });
  const [savingSchedule, setSavingSchedule]   = useState(false);

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function scheduleSummary(sup) {
    const { schedule_days: days, schedule_start: start, schedule_end: end } = sup;
    if (!days?.length && !start && !end) return null;
    const dayStr = days?.length ? days.map((d) => DAY_LABELS[d]).join(' ') : 'Every day';
    const timeStr = start && end ? ` · ${start}–${end} UTC` : '';
    return dayStr + timeStr;
  }

  function openSchedule(sup) {
    setScheduleEditing(sup.id);
    setScheduleForm({
      days: sup.schedule_days || [],
      start: sup.schedule_start || '',
      end: sup.schedule_end || '',
    });
  }

  function toggleDay(d) {
    setScheduleForm((f) => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort((a, b) => a - b),
    }));
  }

  async function saveSchedule(supId) {
    setSavingSchedule(true);
    try {
      const updated = await api.updateEfSupervisor(supId, {
        schedule_days: scheduleForm.days,
        schedule_start: scheduleForm.start || null,
        schedule_end: scheduleForm.end || null,
      });
      setSupervisors((p) => p.map((s) => (s.id === supId ? { ...s, ...updated } : s)));
      setScheduleEditing(null);
    } catch (err) {
      alert('Failed to save schedule: ' + err.message);
    } finally {
      setSavingSchedule(false);
    }
  }

  async function clearSchedule(supId) {
    setSavingSchedule(true);
    try {
      const updated = await api.updateEfSupervisor(supId, { schedule_days: [], schedule_start: null, schedule_end: null });
      setSupervisors((p) => p.map((s) => (s.id === supId ? { ...s, ...updated } : s)));
      setScheduleEditing(null);
    } catch (err) {
      alert('Failed to clear schedule: ' + err.message);
    } finally {
      setSavingSchedule(false);
    }
  }

  useEffect(() => {
    api.getEfSupervisors()
      .then((d) => setSupervisors(d))
      .finally(() => setLoadingSup(false));
    api.getEfSettings()
      .then((d) => {
        setAlertsEnabled(d.soc_alerts_enabled !== false);
        setCustomMessage(d.custom_message || '');
      })
      .catch(() => {});
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      await api.saveEfSettings({ soc_alerts_enabled: alertsEnabled, custom_message: customMessage });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function sendTestSms() {
    setTestingSms(true);
    setTestResult(null);
    try {
      const result = await api.sendTestSms();
      setTestResult({ ok: true, msg: `Sent to ${result.recipients?.join(', ') || result.sent + ' recipient(s)'}` });
    } catch (err) {
      setTestResult({ ok: false, msg: err.message });
    } finally {
      setTestingSms(false);
      setTimeout(() => setTestResult(null), 6000);
    }
  }

  function openTruck(truck) {
    setExpanded(truck.id);
    setForm({
      label: truck.label || '',
      p_ocpp_1: truck.p_ocpp_1 || '',
      p_ocpp_2: truck.p_ocpp_2 || '',
      d_ocpp_1: truck.d_ocpp_1 || '',
      d_ocpp_2: truck.d_ocpp_2 || '',
      soc_alert_threshold: truck.soc_alert_threshold ?? 80,
      notes: truck.notes || '',
    });
  }

  async function saveTruck(truck) {
    setSaving(truck.id);
    try {
      await api.updateChargeTruck(truck.id, form);
      await onRefresh();
      setExpanded(null);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(null);
    }
  }

  async function addSupervisor() {
    if (!newSup.name.trim()) return;
    setAddingSup(true);
    try {
      const d = await api.addEfSupervisor(newSup);
      setSupervisors((p) => [...p, d]);
      setNewSup({ name: '', phone: '', email: '' });
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setAddingSup(false);
    }
  }

  async function toggleActive(sup) {
    const updated = await api.updateEfSupervisor(sup.id, { active: !sup.active });
    setSupervisors((p) => p.map((s) => (s.id === sup.id ? updated : s)));
  }

  async function removeSupervisor(id) {
    await api.deleteEfSupervisor(id);
    setSupervisors((p) => p.filter((s) => s.id !== id));
  }

  const inp = { width: '100%', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 12px', color: '#f1f5f9', fontSize: 12, outline: 'none', boxSizing: 'border-box' };
  const lbl = { fontSize: 10, color: '#8892a4', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' };

  return (
    <div>
      {/* Sub-tab selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #2e3347', paddingBottom: 0 }}>
        {[['trucks', 'Charge Trucks Config'], ['ef', 'Energy Forward Alerts']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSettingsSubTab(key)}
            style={{
              background: 'none', border: 'none', borderBottom: `2px solid ${settingsSubTab === key ? '#47a141' : 'transparent'}`,
              padding: '7px 16px', color: settingsSubTab === key ? '#47a141' : '#8892a4',
              fontSize: 13, fontWeight: settingsSubTab === key ? 700 : 400, cursor: 'pointer', marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {settingsSubTab === 'ef' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
          {/* Energy Forward alert settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Alert Settings</div>
              <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 20 }}>Configure SOC threshold notifications for Energy Forward supervisors.</div>

              {/* Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#22263a', borderRadius: 8, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 7 }}>
                    {alertsEnabled ? <Bell size={13} color="#47a141" /> : <BellOff size={13} color="#6b7280" />}
                    SOC Alerts
                  </div>
                  <div style={{ fontSize: 11, color: '#8892a4', marginTop: 2 }}>Send SMS when a truck side hits its threshold</div>
                </div>
                <button
                  onClick={() => { setAlertsEnabled(!alertsEnabled); setSettingsSaved(false); }}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: alertsEnabled ? '#47a141' : '#2e3347',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: alertsEnabled ? 22 : 3,
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', display: 'block',
                  }} />
                </button>
              </div>

              {/* Custom message */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ ...lbl, marginBottom: 6 }}>Custom Alert Message (optional)</label>
                <textarea
                  value={customMessage}
                  onChange={(e) => { setCustomMessage(e.target.value); setSettingsSaved(false); }}
                  placeholder={`Leave blank to use default:\n"Truck 1 Passenger reached 80%, Driver is at 74%. Ready for deployment."`}
                  rows={4}
                  style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
                <div style={{ fontSize: 11, color: '#8892a4', marginTop: 4 }}>Leave blank to use the auto-generated message with truck name, side, and SOC values.</div>
              </div>

              {/* Save + Test row */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={saveSettings}
                  disabled={savingSettings}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: savingSettings ? '#22263a' : '#47a141', border: 'none', borderRadius: 7, padding: '9px 18px', color: savingSettings ? '#8892a4' : '#fff', fontWeight: 700, fontSize: 13, cursor: savingSettings ? 'not-allowed' : 'pointer' }}
                >
                  <Save size={13} /> {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
                {settingsSaved && <span style={{ fontSize: 12, color: '#47a141', fontWeight: 600 }}>Saved</span>}

                <button
                  onClick={sendTestSms}
                  disabled={testingSms}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#22263a', border: '1px solid #3b82f6', borderRadius: 7, padding: '9px 16px', color: testingSms ? '#8892a4' : '#3b82f6', fontWeight: 600, fontSize: 13, cursor: testingSms ? 'not-allowed' : 'pointer', marginLeft: 'auto' }}
                >
                  <Send size={13} /> {testingSms ? 'Sending...' : 'Send Test SMS'}
                </button>
              </div>

              {testResult && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: testResult.ok ? '#1a3a1a' : '#3f1515', border: `1px solid ${testResult.ok ? '#47a141' : '#ef4444'}`, borderRadius: 7, fontSize: 12, color: testResult.ok ? '#47a141' : '#ef4444' }}>
                  {testResult.ok ? `Test SMS sent to: ${testResult.msg}` : `Failed: ${testResult.msg}`}
                </div>
              )}
            </div>
          </div>

          {/* Right: supervisors */}
          <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #2e3347' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={14} /> Alert Supervisors
              </div>
              <div style={{ fontSize: 11, color: '#8892a4', marginTop: 3 }}>Receive SMS when a truck hits its SOC threshold</div>
            </div>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #2e3347', background: '#1e2535' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <input style={inp} placeholder="Name *" value={newSup.name} onChange={(e) => setNewSup({ ...newSup, name: e.target.value })} />
                <input style={inp} placeholder="Phone (+14081234567)" value={newSup.phone} onChange={(e) => setNewSup({ ...newSup, phone: e.target.value })} />
                <input style={inp} placeholder="Email (optional)" value={newSup.email} onChange={(e) => setNewSup({ ...newSup, email: e.target.value })} />
                <button
                  onClick={addSupervisor}
                  disabled={addingSup || !newSup.name.trim()}
                  style={{ background: !newSup.name.trim() ? '#22263a' : '#47a141', border: 'none', borderRadius: 7, padding: '8px 0', color: !newSup.name.trim() ? '#6b7280' : '#fff', fontWeight: 700, fontSize: 12, cursor: !newSup.name.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Plus size={12} /> Add Supervisor
                </button>
              </div>
            </div>
            {loadingSup ? (
              <div style={{ padding: 24, color: '#8892a4', fontSize: 12 }}>Loading...</div>
            ) : supervisors.length === 0 ? (
              <div style={{ padding: 24, color: '#8892a4', fontSize: 12, textAlign: 'center' }}>No supervisors added yet.</div>
            ) : (
              supervisors.map((sup) => {
                const summary = scheduleSummary(sup);
                const isEditingSched = scheduleEditing === sup.id;
                return (
                  <div key={sup.id} style={{ borderBottom: '1px solid #2e3347' }}>
                    {/* Main row */}
                    <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: sup.active ? '#f1f5f9' : '#6b7280' }}>{sup.name}</div>
                        {sup.phone && <div style={{ fontSize: 11, color: '#8892a4' }}>{sup.phone}</div>}
                        {sup.email && <div style={{ fontSize: 11, color: '#8892a4' }}>{sup.email}</div>}
                        {summary && (
                          <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={10} /> {summary}
                          </div>
                        )}
                        {!summary && (
                          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>All days, all hours</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => isEditingSched ? setScheduleEditing(null) : openSchedule(sup)}
                          style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: `1px solid ${isEditingSched ? '#3b82f6' : '#2e3347'}`, background: isEditingSched ? '#1a2540' : 'none', color: isEditingSched ? '#3b82f6' : '#8892a4', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Clock size={10} /> Schedule
                        </button>
                        <button onClick={() => toggleActive(sup)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: `1px solid ${sup.active ? '#47a141' : '#6b7280'}`, background: 'none', color: sup.active ? '#47a141' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}>
                          {sup.active ? 'Active' : 'Off'}
                        </button>
                        <button onClick={() => removeSupervisor(sup.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                          <Trash2 size={13} color="#ef4444" />
                        </button>
                      </div>
                    </div>

                    {/* Inline schedule editor */}
                    {isEditingSched && (
                      <div style={{ padding: '0 20px 16px', background: '#0f1117' }}>
                        <div style={{ fontSize: 10, color: '#8892a4', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                          Alert Schedule — leave blank to always send
                        </div>

                        {/* Day toggles */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, color: '#8892a4', marginBottom: 6 }}>Active days (none = every day)</div>
                          <div style={{ display: 'flex', gap: 5 }}>
                            {DAY_LABELS.map((label, idx) => {
                              const active = scheduleForm.days.includes(idx);
                              return (
                                <button
                                  key={idx}
                                  onClick={() => toggleDay(idx)}
                                  style={{ width: 34, height: 30, borderRadius: 6, border: `1px solid ${active ? '#3b82f6' : '#2e3347'}`, background: active ? '#1a2540' : '#22263a', color: active ? '#3b82f6' : '#6b7280', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                                >
                                  {label.slice(0, 2)}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Time range */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, color: '#8892a4', marginBottom: 6 }}>Time window — UTC (leave blank for all hours)</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="time"
                              value={scheduleForm.start}
                              onChange={(e) => setScheduleForm((f) => ({ ...f, start: e.target.value }))}
                              style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 6, padding: '6px 10px', color: '#f1f5f9', fontSize: 12, outline: 'none' }}
                            />
                            <span style={{ fontSize: 11, color: '#6b7280' }}>to</span>
                            <input
                              type="time"
                              value={scheduleForm.end}
                              onChange={(e) => setScheduleForm((f) => ({ ...f, end: e.target.value }))}
                              style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 6, padding: '6px 10px', color: '#f1f5f9', fontSize: 12, outline: 'none' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => saveSchedule(sup.id)}
                            disabled={savingSchedule}
                            style={{ background: '#47a141', border: 'none', borderRadius: 6, padding: '6px 14px', color: '#fff', fontSize: 11, fontWeight: 700, cursor: savingSchedule ? 'not-allowed' : 'pointer' }}
                          >
                            {savingSchedule ? 'Saving...' : 'Save Schedule'}
                          </button>
                          <button
                            onClick={() => clearSchedule(sup.id)}
                            disabled={savingSchedule}
                            style={{ background: 'none', border: '1px solid #2e3347', borderRadius: 6, padding: '6px 14px', color: '#8892a4', fontSize: 11, cursor: 'pointer' }}
                          >
                            Clear (always send)
                          </button>
                          <button
                            onClick={() => setScheduleEditing(null)}
                            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 11, cursor: 'pointer', marginLeft: 'auto' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {settingsSubTab === 'trucks' && (
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>OCPP ID Configuration</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trucks.map((truck) => (
            <div key={truck.id} style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 10, overflow: 'hidden' }}>
              <div
                onClick={() => expanded === truck.id ? setExpanded(null) : openTruck(truck)}
                style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14 }}>{truck.label || `Truck ${truck.truck_number}`}</span>
                  <span style={{ fontSize: 10, color: '#8892a4', background: '#22263a', borderRadius: 4, padding: '2px 7px' }}>{truck.truck_type === 'compact' ? '4-cable' : '8-cable'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: truck.p_ocpp_1 ? '#47a141' : '#6b7280' }}>{truck.p_ocpp_1 ? 'Configured' : 'Not configured'}</span>
                  {expanded === truck.id ? <ChevronUp size={14} color="#8892a4" /> : <ChevronDown size={14} color="#8892a4" />}
                </div>
              </div>

              {expanded === truck.id && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid #2e3347' }}>
                  <div style={{ paddingTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Label</label>
                      <input style={inp} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={`Truck ${truck.truck_number}`} />
                    </div>
                    <div>
                      <label style={lbl}>SOC Alert Threshold (%)</label>
                      <input style={inp} type="number" min={50} max={100} value={form.soc_alert_threshold} onChange={(e) => setForm({ ...form, soc_alert_threshold: Number(e.target.value) })} />
                    </div>
                  </div>

                  {['passenger', 'driver'].map((side) => {
                    const pfx = side === 'passenger' ? 'p' : 'd';
                    return (
                      <div key={side} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                          {side === 'passenger' ? 'Passenger' : 'Driver'} Side OCPP IDs
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: truck.truck_type === 'compact' ? '1fr' : '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={lbl}>Board 1 (Cables A &amp; B)</label>
                            <input style={inp} value={form[`${pfx}_ocpp_1`]} onChange={(e) => setForm({ ...form, [`${pfx}_ocpp_1`]: e.target.value })} placeholder="e.g. T1P-BOARD1" />
                          </div>
                          {truck.truck_type === 'standard' && (
                            <div>
                              <label style={lbl}>Board 2 (Cables C &amp; D)</label>
                              <input style={inp} value={form[`${pfx}_ocpp_2`]} onChange={(e) => setForm({ ...form, [`${pfx}_ocpp_2`]: e.target.value })} placeholder="e.g. T1P-BOARD2" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Notes</label>
                    <input style={inp} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => saveTruck(truck)} disabled={saving === truck.id} style={{ background: saving === truck.id ? '#22263a' : '#47a141', border: 'none', borderRadius: 7, padding: '8px 18px', color: saving === truck.id ? '#8892a4' : '#fff', fontWeight: 700, fontSize: 12, cursor: saving === truck.id ? 'not-allowed' : 'pointer' }}>
                      {saving === truck.id ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setExpanded(null)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 14px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

// ─── Demo data for test mode ──────────────────────────────────────────────────

function getDemoTrucks(tick) {
  const t = tick * 0.4;
  const TRUCKS = [
    { n: 1, type: 'standard', baseSocs: { p1: 72, p2: 68, d1: 85, d2: 82 } },
    { n: 2, type: 'standard', baseSocs: { p1: 55, p2: 51, d1: 43, d2: 47 } },
    { n: 3, type: 'standard', baseSocs: { p1: 91, p2: 88, d1: 78, d2: 74 } },
    { n: 4, type: 'compact',  baseSocs: { p1: 33, p2: null, d1: 62, d2: null } },
    { n: 5, type: 'compact',  baseSocs: { p1: 64, p2: null, d1: 29, d2: null } },
    { n: 6, type: 'standard', baseSocs: { p1: 48, p2: 44, d1: 57, d2: 53 } },
  ];

  function unit(baseSoc, phase, hasUnit) {
    if (!hasUnit || baseSoc === null) return null;
    const soc = Math.min(97, Math.max(5, baseSoc + Math.sin(t + phase) * 3.5));
    const kw  = 148 + Math.sin(t * 1.3 + phase) * 9 + Math.cos(t * 0.8 + phase) * 5;
    return {
      status: 'charging',
      soc,
      power_kw: kw,
      connectors: [{ connector_id: 1, active: true }, { connector_id: 2, active: true }],
    };
  }

  return TRUCKS.map(({ n, type, baseSocs }, i) => {
    const isCompact = type === 'compact';
    const ph = i * 0.9;
    return {
      id: `demo-truck-${n}`,
      truck_number: n,
      truck_type: type,
      label: `Truck ${n}`,
      p_ocpp_1: `T${n}P-BOARD1`,
      p_ocpp_2: isCompact ? null : `T${n}P-BOARD2`,
      d_ocpp_1: `T${n}D-BOARD1`,
      d_ocpp_2: isCompact ? null : `T${n}D-BOARD2`,
      soc_alert_threshold: 80,
      live: {
        passenger: {
          unit_1: unit(baseSocs.p1, ph,       true),
          unit_2: unit(baseSocs.p2, ph + 0.4, !isCompact),
        },
        driver: {
          unit_1: unit(baseSocs.d1, ph + 0.7, true),
          unit_2: unit(baseSocs.d2, ph + 1.1, !isCompact),
        },
      },
    };
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChargeTrucks() {
  const [trucks, setTrucks]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('fleet');
  const [lastUpdated, setLast]    = useState(null);
  const [testMode, setTestMode]   = useState(false);
  const [demoTick, setDemoTick]   = useState(0);
  const profile = useProfile();
  const isAdmin = profile?.role === 'admin';

  const load = useCallback(async () => {
    try {
      const data = await api.getChargeTrucks();
      setTrucks(data);
      setLast(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!testMode) return;
    const iv = setInterval(() => setDemoTick((t) => t + 1), 1800);
    return () => clearInterval(iv);
  }, [testMode]);

  const displayTrucks = testMode ? getDemoTrucks(demoTick) : trucks;
  const totalOnline   = displayTrucks.filter((t) => ['online', 'charging'].includes(truckStatus(t.live))).length;
  const totalCharging = displayTrucks.filter((t) => truckStatus(t.live) === 'charging').length;
  const totalKw       = displayTrucks.reduce((sum, t) => sum + sidePower(t.live, 'passenger') + sidePower(t.live, 'driver'), 0);

  if (loading && !testMode) return <div style={{ padding: '32px 36px', color: '#8892a4' }}>Loading fleet data...</div>;

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1280 }}>
      {/* Test mode banner */}
      {testMode && (
        <div style={{ background: '#2a1f00', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: '#f59e0b', color: '#000', fontWeight: 800, fontSize: 10, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>Test Mode</span>
          <span style={{ fontSize: 12, color: '#fbbf24' }}>Simulated data — all 6 trucks shown charging at full capacity. Real fleet data is paused.</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Truck size={20} color="#47a141" /> Charge Trucks
          </h1>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Mobile energy fleet · refreshes every 30 s</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!testMode && lastUpdated && <span style={{ fontSize: 11, color: '#8892a4' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
          {/* Test mode toggle */}
          <button
            onClick={() => { setTestMode((m) => !m); setDemoTick(0); }}
            style={{ background: testMode ? '#2a1f00' : '#22263a', border: `1px solid ${testMode ? '#f59e0b' : '#2e3347'}`, borderRadius: 7, padding: '7px 14px', color: testMode ? '#f59e0b' : '#8892a4', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: testMode ? '#f59e0b' : '#4b5563', display: 'inline-block', boxShadow: testMode ? '0 0 6px #f59e0b' : 'none' }} />
            {testMode ? 'Test Mode ON' : 'Test Mode'}
          </button>
          <button onClick={load} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '7px 12px', color: '#8892a4', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Trucks',   value: displayTrucks.length,  color: '#f1f5f9' },
          { label: 'Online',         value: totalOnline,    color: '#47a141' },
          { label: 'Charging',       value: totalCharging,  color: '#3b82f6' },
          { label: 'Total Output',   value: `${totalKw.toFixed(1)} kW`, color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '18px 22px' }}>
            <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #2e3347', marginBottom: 24 }}>
        {[['fleet', 'Fleet Overview'], ...(isAdmin ? [['settings', 'Settings & OCPP Config']] : [])].map(([key, lbl]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === key ? '#47a141' : 'transparent'}`, padding: '8px 16px', marginBottom: -1, color: tab === key ? '#47a141' : '#8892a4', fontSize: 13, fontWeight: tab === key ? 700 : 400, cursor: 'pointer' }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#3f1515', border: '1px solid #ef4444', borderRadius: 8, padding: '12px 16px', color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {tab === 'fleet' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(560px, 1fr))', gap: 16 }}>
          {displayTrucks.map((truck) => <TruckCard key={truck.id} truck={truck} />)}
          {displayTrucks.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: 60, textAlign: 'center', color: '#8892a4', background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12 }}>
              No trucks found. Run the SQL setup in Supabase to create the fleet.
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && isAdmin && (
        <SettingsTab trucks={trucks} onRefresh={load} />
      )}
    </div>
  );
}
