import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../contexts/ProfileContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const FALLBACK_SHIFTS = [
  { id: 'day', name: 'Day Shift', start_time: '06:00', end_time: '18:00', color: '#3b82f6' },
  { id: 'night', name: 'Night Shift', start_time: '18:00', end_time: '06:00', color: '#a855f7' },
];

// ── Test data ─────────────────────────────────────────────────────────────────

const DEMO_EMPS = [
  { id: 'de1', first_name: 'Marcus', last_name: 'Thompson', role: 'driver' },
  { id: 'de2', first_name: 'Jasmine', last_name: 'Rivera', role: 'driver' },
  { id: 'de3', first_name: 'Terrence', last_name: 'Washington', role: 'driver' },
  { id: 'de4', first_name: 'Alyssa', last_name: 'Chen', role: 'driver' },
  { id: 'de5', first_name: 'Kevin', last_name: 'Park', role: 'admin' },
];

const DEMO_TIME_OFF = [
  { id: 'tor1', employee_id: 'de2', start_date: '2026-06-23', end_date: '2026-06-25', reason: 'Vacation', status: 'pending', employees: { first_name: 'Jasmine', last_name: 'Rivera' } },
  { id: 'tor2', employee_id: 'de4', start_date: '2026-07-04', end_date: '2026-07-04', reason: 'Holiday', status: 'approved', employees: { first_name: 'Alyssa', last_name: 'Chen' } },
];

function buildDemoAssignments(monday) {
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const isWeekend = i >= 5;
    result.push({ id: `d-day-${d}-1`, employee_id: 'de1', shift_id: 'day', work_date: d, is_supervisor: true, employees: { first_name: 'Marcus', last_name: 'Thompson' }, shifts: FALLBACK_SHIFTS[0] });
    if (!isWeekend) {
      result.push({ id: `d-day-${d}-2`, employee_id: 'de2', shift_id: 'day', work_date: d, is_supervisor: false, employees: { first_name: 'Jasmine', last_name: 'Rivera' }, shifts: FALLBACK_SHIFTS[0] });
      result.push({ id: `d-night-${d}-3`, employee_id: 'de3', shift_id: 'night', work_date: d, is_supervisor: true, employees: { first_name: 'Terrence', last_name: 'Washington' }, shifts: FALLBACK_SHIFTS[1] });
      result.push({ id: `d-night-${d}-4`, employee_id: 'de4', shift_id: 'night', work_date: d, is_supervisor: false, employees: { first_name: 'Alyssa', last_name: 'Chen' }, shifts: FALLBACK_SHIFTS[1] });
    }
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMondayStr(offset = 0) {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtWeekRange(monday) {
  const sunday = addDays(monday, 6);
  const m = new Date(monday + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const s = new Date(sunday + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${m} – ${s}`;
}

function StatusBadge({ status }) {
  const c = { pending: '#f59e0b', approved: '#47a141', denied: '#ef4444' }[status] || '#6b7280';
  return (
    <span style={{ background: c + '22', color: c, border: `1px solid ${c}44`, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

// ── Admin view ────────────────────────────────────────────────────────────────

function AdminSchedule({ testMode }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [shifts, setShifts] = useState(FALLBACK_SHIFTS);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [timeOffList, setTimeOffList] = useState([]);
  const [settings, setSettings] = useState({ time_off_min_notice_days: 14, auto_notify_enabled: false, auto_notify_day: 'sunday', notify_via_sms: true, notify_via_email: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCell, setActiveCell] = useState(null);
  const [addEmpId, setAddEmpId] = useState('');
  const [addIsSupervisor, setAddIsSupervisor] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [notifying, setNotifying] = useState(null);
  const [toast, setToast] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const monday = getMondayStr(weekOffset);

  const load = useCallback(async () => {
    setLoading(true);
    if (testMode) {
      setAssignments(buildDemoAssignments(monday));
      setShifts(FALLBACK_SHIFTS);
      setEmployees(DEMO_EMPS);
      setTimeOffList(DEMO_TIME_OFF);
      setLoading(false);
      return;
    }
    try {
      const [sched, shiftsData, empData, torData, settData] = await Promise.all([
        api.getSchedule(monday),
        api.getShifts(),
        api.getEmployees({ active: 'true' }),
        api.getTimeOffRequests(),
        api.getScheduleSettings(),
      ]);
      setAssignments(sched.assignments || []);
      setShifts(Array.isArray(shiftsData) && shiftsData.length ? shiftsData : FALLBACK_SHIFTS);
      setEmployees(Array.isArray(empData) ? empData : []);
      setTimeOffList(Array.isArray(torData) ? torData : []);
      if (settData && !settData.error) setSettings(settData);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [monday, testMode]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg, color = '#47a141') {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleAdd() {
    if (!addEmpId || !activeCell) return;
    if (testMode) { showToast('Demo mode — no changes saved'); return; }
    setAdding(true);
    try {
      await api.createAssignment({ employee_id: addEmpId, shift_id: activeCell.shiftId, work_date: activeCell.date, is_supervisor: addIsSupervisor });
      setAddEmpId('');
      setAddIsSupervisor(false);
      load();
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setAdding(false); }
  }

  async function handleRemove(id) {
    if (testMode) { showToast('Demo mode — no changes saved'); return; }
    setRemoving(id);
    try { await api.deleteAssignment(id); load(); }
    catch (err) { alert('Failed: ' + err.message); }
    finally { setRemoving(null); }
  }

  async function handleReviewTimeOff(id, status) {
    if (testMode) { showToast('Demo mode — no changes saved'); return; }
    try { await api.reviewTimeOffRequest(id, status); load(); }
    catch (err) { alert('Failed: ' + err.message); }
  }

  async function handleNotify(method) {
    setNotifying(method);
    try {
      await api.sendScheduleNotification(method);
      showToast(`Schedule notification sent via ${method === 'sms' ? 'SMS' : 'email'}`);
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setNotifying(null); }
  }

  async function handleSaveSettings() {
    if (testMode) { showToast('Demo mode — no changes saved'); return; }
    setSavingSettings(true);
    try { await api.updateScheduleSettings(settings); showToast('Settings saved'); }
    catch (err) { alert('Failed: ' + err.message); }
    finally { setSavingSettings(false); }
  }

  function getCellAssignments(shiftId, date) {
    return assignments.filter((a) => a.shift_id === shiftId && a.work_date === date);
  }

  const today = new Date().toISOString().slice(0, 10);
  const inpStyle = { background: '#0f1117', border: '1px solid #2e3347', borderRadius: 7, padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, background: toast.color, color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px #0006' }}>
          {toast.msg}
        </div>
      )}

      {/* Week nav + send */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setWeekOffset((o) => o - 1)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 14px', color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>← Prev</button>
          <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14 }}>Week of {fmtWeekRange(monday)}</span>
          <button onClick={() => setWeekOffset((o) => o + 1)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 14px', color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>Next →</button>
          {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={{ background: 'none', border: 'none', color: '#47a141', fontSize: 12, cursor: 'pointer', padding: '8px 4px' }}>Today</button>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => handleNotify('sms')} disabled={!!notifying} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 14px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>
            {notifying === 'sms' ? 'Sending...' : 'Send SMS'}
          </button>
          <button onClick={() => handleNotify('email')} disabled={!!notifying} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 14px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>
            {notifying === 'email' ? 'Sending...' : 'Send Email'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#1a1d27', border: '1px solid #ef444444', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Database migration required</div>
          <div style={{ fontSize: 12, color: '#8892a4' }}>Run <code style={{ color: '#f59e0b' }}>supabase_migration_schedules.sql</code> in your Supabase SQL editor, then refresh.</div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#8892a4' }}>Loading schedule...</div>
      ) : (
        <>
          {/* Grid */}
          <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: 760 }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '130px repeat(7, 1fr)', borderBottom: '1px solid #2e3347' }}>
                  <div style={{ padding: '10px 14px', background: '#22263a', borderRight: '1px solid #2e3347' }} />
                  {DAYS.map((day, i) => {
                    const dateStr = addDays(monday, i);
                    const isToday = dateStr === today;
                    return (
                      <div key={day} style={{ padding: '10px 8px', background: '#22263a', borderRight: i < 6 ? '1px solid #2e3347' : 'none', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 600 }}>{day}</div>
                        <div style={{ fontSize: 14, color: isToday ? '#47a141' : '#f1f5f9', fontWeight: isToday ? 800 : 400 }}>
                          {new Date(dateStr + 'T12:00:00').getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Shift rows */}
                {shifts.map((shift, si) => (
                  <div key={shift.id} style={{ display: 'grid', gridTemplateColumns: '130px repeat(7, 1fr)', borderBottom: si < shifts.length - 1 ? '1px solid #2e3347' : 'none', minHeight: 80 }}>
                    <div style={{ padding: '12px 14px', borderRight: '1px solid #2e3347', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: shift.color }}>{shift.name}</div>
                      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{shift.start_time}–{shift.end_time}</div>
                    </div>
                    {DAYS.map((day, di) => {
                      const dateStr = addDays(monday, di);
                      const cellA = getCellAssignments(shift.id, dateStr);
                      const isActive = activeCell?.shiftId === shift.id && activeCell?.date === dateStr;
                      return (
                        <div
                          key={day}
                          onClick={() => setActiveCell(isActive ? null : { shiftId: shift.id, date: dateStr })}
                          style={{ padding: '6px 5px', borderRight: di < 6 ? '1px solid #2e3347' : 'none', background: isActive ? '#22263a' : 'transparent', cursor: 'pointer', minHeight: 80, display: 'flex', flexDirection: 'column', gap: 3 }}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#22263a44'; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                        >
                          {cellA.map((a) => {
                            const emp = a.employees || {};
                            const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || '?';
                            return (
                              <div key={a.id} style={{ background: shift.color + '22', border: `1px solid ${shift.color}44`, borderRadius: 4, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3 }}>
                                {a.is_supervisor && <span style={{ color: '#f59e0b', fontSize: 8 }}>★</span>}
                                <span style={{ fontSize: 10, color: '#f1f5f9', fontWeight: a.is_supervisor ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                              </div>
                            );
                          })}
                          {cellA.length === 0 && <div style={{ fontSize: 9, color: '#4b5563', textAlign: 'center', marginTop: 6 }}>+ Add</div>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cell detail panel */}
          {activeCell && (
            <div style={{ background: '#1a1d27', border: '1px solid #47a14166', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', marginBottom: 14 }}>
                {shifts.find((s) => s.id === activeCell.shiftId)?.name} — {fmtDate(activeCell.date)}
              </div>
              {getCellAssignments(activeCell.shiftId, activeCell.date).map((a) => {
                const emp = a.employees || {};
                const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                      {a.is_supervisor && <span style={{ background: '#f59e0b22', color: '#f59e0b', fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>SUPERVISOR</span>}
                      <span style={{ fontSize: 13, color: '#f1f5f9', wordBreak: 'break-word' }}>{name}</span>
                    </div>
                    <button onClick={() => handleRemove(a.id)} disabled={removing === a.id} style={{ background: '#3f1515', border: '1px solid #ef444444', borderRadius: 5, padding: '6px 12px', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>
                      {removing === a.id ? '...' : 'Remove'}
                    </button>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={addEmpId} onChange={(e) => setAddEmpId(e.target.value)} style={{ ...inpStyle, flex: 1, minWidth: 160 }}>
                  <option value="">Select employee...</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={addIsSupervisor} onChange={(e) => setAddIsSupervisor(e.target.checked)} style={{ accentColor: '#f59e0b' }} />
                  Supervisor
                </label>
                <button onClick={handleAdd} disabled={!addEmpId || adding} style={{ background: addEmpId ? '#47a141' : '#22263a', border: 'none', borderRadius: 7, padding: '7px 16px', color: addEmpId ? '#fff' : '#8892a4', fontSize: 13, fontWeight: 700, cursor: addEmpId ? 'pointer' : 'not-allowed' }}>
                  {adding ? 'Adding...' : 'Add to Shift'}
                </button>
                <button onClick={() => setActiveCell(null)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '7px 12px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>Close</button>
              </div>
            </div>
          )}

          {/* Time-off requests */}
          <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ background: '#22263a', borderBottom: '1px solid #2e3347', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>Time-Off Requests</span>
              <span style={{ fontSize: 12, color: '#8892a4' }}>{timeOffList.filter((r) => r.status === 'pending').length} pending</span>
            </div>
            {timeOffList.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#8892a4', fontSize: 13 }}>No time-off requests.</div>
            ) : (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2e3347' }}>
                      {['Employee', 'Dates', 'Reason', 'Status', 'Actions'].map((h) => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {timeOffList.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #2e334722' }}>
                        <td style={{ padding: '10px 16px', color: '#f1f5f9', fontWeight: 600 }}>
                          {r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#8892a4', whiteSpace: 'nowrap' }}>
                          {fmtDate(r.start_date)}{r.start_date !== r.end_date ? ` – ${fmtDate(r.end_date)}` : ''}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#8892a4' }}>{r.reason || '—'}</td>
                        <td style={{ padding: '10px 16px' }}><StatusBadge status={r.status} /></td>
                        <td style={{ padding: '10px 16px' }}>
                          {r.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button onClick={() => handleReviewTimeOff(r.id, 'approved')} style={{ background: '#1a2e1a', border: '1px solid #47a14166', borderRadius: 5, padding: '6px 10px', color: '#47a141', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Approve</button>
                              <button onClick={() => handleReviewTimeOff(r.id, 'denied')} style={{ background: '#3f1515', border: '1px solid #ef444444', borderRadius: 5, padding: '6px 10px', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>Deny</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Settings */}
          <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 14, overflow: 'hidden' }}>
            <button onClick={() => setShowSettings((s) => !s)} style={{ width: '100%', background: '#22263a', border: 'none', borderBottom: showSettings ? '1px solid #2e3347' : 'none', padding: '14px 20px', color: '#f1f5f9', fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
              Schedule Settings
              <span style={{ color: '#8892a4', fontSize: 12 }}>{showSettings ? '▲' : '▼'}</span>
            </button>
            {showSettings && (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 6 }}>Min notice for time-off requests (days)</label>
                    <input type="number" style={{ ...inpStyle, width: '100%', boxSizing: 'border-box' }} value={settings.time_off_min_notice_days} onChange={(e) => setSettings((s) => ({ ...s, time_off_min_notice_days: parseInt(e.target.value) || 14 }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 6 }}>Auto-notify day of week</label>
                    <select style={{ ...inpStyle, width: '100%', boxSizing: 'border-box' }} value={settings.auto_notify_day || 'sunday'} onChange={(e) => setSettings((s) => ({ ...s, auto_notify_day: e.target.value }))}>
                      {['sunday', 'monday', 'saturday'].map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {[
                    { key: 'auto_notify_enabled', label: 'Auto-send schedule weekly' },
                    { key: 'notify_via_sms', label: 'Notify via SMS' },
                    { key: 'notify_via_email', label: 'Notify via Email' },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!settings[key]} onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))} style={{ accentColor: '#47a141', width: 14, height: 14 }} />
                      {label}
                    </label>
                  ))}
                </div>
                <div>
                  <button onClick={handleSaveSettings} disabled={savingSettings} style={{ background: '#47a141', border: 'none', borderRadius: 7, padding: '8px 20px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    {savingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Driver view ───────────────────────────────────────────────────────────────

function DriverSchedule({ email, testMode }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [assignments, setAssignments] = useState([]);
  const [shifts, setShifts] = useState(FALLBACK_SHIFTS);
  const [myTimeOff, setMyTimeOff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [myEmpId, setMyEmpId] = useState(null);

  const monday = getMondayStr(weekOffset);

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (testMode) {
        const demo = buildDemoAssignments(monday);
        setAssignments(demo.filter((a) => a.employee_id === 'de1'));
        setShifts(FALLBACK_SHIFTS);
        setMyTimeOff(DEMO_TIME_OFF.slice(0, 1));
        setLoading(false);
        return;
      }
      try {
        const [sched, shiftsData, empData] = await Promise.all([
          api.getMySchedule(email, monday),
          api.getShifts(),
          api.getEmployees({ search: email }),
        ]);
        setAssignments(sched.assignments || []);
        setShifts(Array.isArray(shiftsData) && shiftsData.length ? shiftsData : FALLBACK_SHIFTS);
        const emp = (Array.isArray(empData) ? empData : []).find((e) => e.email === email);
        if (emp) {
          setMyEmpId(emp.id);
          const tor = await api.getTimeOffRequests(emp.id);
          setMyTimeOff(Array.isArray(tor) ? tor : []);
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
  }, [email, monday, testMode]);

  async function handleSubmit() {
    if (!form.start_date || !form.end_date) { alert('Please select dates.'); return; }
    if (testMode) { setShowForm(false); setToast('Demo mode — not saved'); setTimeout(() => setToast(null), 3000); return; }
    if (!myEmpId) { alert('Your employee record was not found. Contact your admin.'); return; }
    setSubmitting(true);
    try {
      await api.createTimeOffRequest({ employee_id: myEmpId, ...form });
      setShowForm(false);
      setForm({ start_date: '', end_date: '', reason: '' });
      setToast('Time-off request submitted');
      setTimeout(() => setToast(null), 3000);
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setSubmitting(false); }
  }

  const inpStyle = { background: '#0f1117', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 11px', color: '#f1f5f9', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' };

  return (
    <div>
      {toast && <div style={{ position: 'fixed', top: 20, right: 24, background: '#47a141', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setWeekOffset((o) => o - 1)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 14px', color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>← Prev</button>
          <span style={{ fontWeight: 700, color: '#f1f5f9' }}>Week of {fmtWeekRange(monday)}</span>
          <button onClick={() => setWeekOffset((o) => o + 1)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 14px', color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>Next →</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => alert('Schedule emailed to ' + email)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 14px', color: '#8892a4', fontSize: 12, cursor: 'pointer' }}>Email My Schedule</button>
          <button onClick={() => setShowForm(true)} style={{ background: '#1a2e1a', border: '1px solid #47a14166', borderRadius: 7, padding: '8px 14px', color: '#47a141', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Request Time Off</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#8892a4' }}>Loading your schedule...</div>
      ) : assignments.length === 0 ? (
        <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, padding: '40px', textAlign: 'center', color: '#8892a4', marginBottom: 20 }}>
          No shifts scheduled for this week.
        </div>
      ) : (
        <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2e3347' }}>
                  {['Day', 'Date', 'Shift', 'Hours', 'Role'].map((h) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...assignments].sort((a, b) => a.work_date.localeCompare(b.work_date)).map((a) => {
                  const shift = (a.shifts) || shifts.find((s) => s.id === a.shift_id) || {};
                  const dayName = new Date(a.work_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid #2e334722' }}>
                      <td style={{ padding: '12px 16px', color: '#f1f5f9', fontWeight: 600, whiteSpace: 'nowrap' }}>{dayName}</td>
                      <td style={{ padding: '12px 16px', color: '#8892a4', whiteSpace: 'nowrap' }}>{fmtDate(a.work_date)}</td>
                      <td style={{ padding: '12px 16px' }}><span style={{ color: shift.color || '#47a141', fontWeight: 600 }}>{shift.name || '—'}</span></td>
                      <td style={{ padding: '12px 16px', color: '#8892a4', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{shift.start_time}–{shift.end_time}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {a.is_supervisor
                          ? <span style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44', borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Supervisor</span>
                          : <span style={{ color: '#6b7280', fontSize: 12 }}>Driver</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Time-off form */}
      {showForm && (
        <div style={{ background: '#1a1d27', border: '1px solid #47a14166', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', marginBottom: 16 }}>Request Time Off</div>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} style={inpStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>End Date</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} style={inpStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>Reason (optional)</label>
            <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Vacation, personal, medical..." style={inpStyle} />
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>Minimum 14 days advance notice required.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSubmit} disabled={submitting} style={{ background: '#47a141', border: 'none', borderRadius: 7, padding: '8px 20px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ background: '#22263a', border: '1px solid #2e3347', borderRadius: 7, padding: '8px 16px', color: '#8892a4', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* My requests */}
      {myTimeOff.length > 0 && (
        <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ background: '#22263a', borderBottom: '1px solid #2e3347', padding: '14px 20px', fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>My Time-Off Requests</div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2e3347' }}>
                  {['Dates', 'Reason', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myTimeOff.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #2e334722' }}>
                    <td style={{ padding: '10px 16px', color: '#f1f5f9', whiteSpace: 'nowrap' }}>{fmtDate(r.start_date)}{r.start_date !== r.end_date ? ` – ${fmtDate(r.end_date)}` : ''}</td>
                    <td style={{ padding: '10px 16px', color: '#8892a4' }}>{r.reason || '—'}</td>
                    <td style={{ padding: '10px 16px' }}><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Schedules() {
  const profile = useProfile();
  const isDriver = profile?.role === 'driver';
  const [testMode, setTestMode] = useState(false);

  return (
    <div className="px-4 py-5 md:px-9 md:py-8" style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{isDriver ? 'My Schedule' : 'Schedules'}</h1>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4, wordBreak: 'break-word' }}>
            {isDriver ? 'View your shifts and request time off' : 'Manage weekly shifts, assign employees, and handle time-off requests'}
          </div>
        </div>
        <button
          onClick={() => setTestMode((m) => !m)}
          style={{ background: testMode ? '#2a1f00' : '#22263a', border: `1px solid ${testMode ? '#f59e0b' : '#2e3347'}`, borderRadius: 7, padding: '8px 14px', color: testMode ? '#f59e0b' : '#8892a4', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: testMode ? '#f59e0b' : '#4b5563', display: 'inline-block' }} />
          {testMode ? 'Test Mode ON' : 'Test Mode'}
        </button>
      </div>

      {testMode && (
        <div style={{ background: '#2a1f00', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: '#f59e0b', color: '#000', fontWeight: 800, fontSize: 10, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', flexShrink: 0 }}>Test Mode</span>
          <span style={{ fontSize: 12, color: '#fbbf24' }}>Showing demo schedule with 5 employees. Changes are not saved.</span>
        </div>
      )}

      {isDriver
        ? <DriverSchedule email={profile?.email || ''} testMode={testMode} />
        : <AdminSchedule testMode={testMode} />
      }
    </div>
  );
}
