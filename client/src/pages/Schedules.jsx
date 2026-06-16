import { useState, useEffect, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Star, CheckCircle, XCircle, Send, Plus, Trash2, Settings, X } from 'lucide-react';
import { useProfile } from '../contexts/ProfileContext';
import { api } from '../lib/api';

const COLORS = {
  bg: '#0f1117', card: '#1a1d27', border: '#2e3347',
  text: '#f1f5f9', muted: '#8892a4', accent: '#47a141',
};

function getWeekDates(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toISO(date) { return date.toISOString().slice(0, 10); }

function StatusBadge({ status }) {
  const map = { pending: '#f59e0b', approved: '#47a141', denied: '#ef4444' };
  const color = map[status] || '#6b7280';
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{status}</span>
  );
}

export default function Schedules() {
  const profile = useProfile();
  const userRole = profile?.role || 'driver';
  const userEmail = profile?.email || '';
  const isAdmin = userRole === 'admin';

  const [currentWeek, setCurrentWeek] = useState(toISO(new Date()));
  const [weekDates, setWeekDates] = useState(getWeekDates());
  const [assignments, setAssignments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [timeOffRequests, setTimeOffRequests] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  const [showAddCell, setShowAddCell] = useState(null);
  const [addEmpId, setAddEmpId] = useState('');
  const [addSupervisor, setAddSupervisor] = useState(false);
  const [showTimeOffForm, setShowTimeOffForm] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState('');

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schedData, shiftsData, empData, toData, settData] = await Promise.all([
        api.getSchedule(currentWeek),
        api.getShifts(),
        api.getEmployees({ active: 'true' }),
        api.getTimeOffRequests(),
        api.getScheduleSettings()
      ]);
      if (schedData.error) throw new Error(schedData.error);
      setAssignments(schedData.assignments || []);
      setShifts(Array.isArray(shiftsData) ? shiftsData : []);
      setEmployees(Array.isArray(empData) ? empData : []);
      setTimeOffRequests(Array.isArray(toData) ? toData : []);
      if (settData && !settData.error) { setSettings(settData); setSettingsForm(settData); }
      setWeekDates(getWeekDates(currentWeek));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentWeek]);

  const loadDriverData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schedData, shiftsData, toData] = await Promise.all([
        api.getMySchedule(userEmail, currentWeek),
        api.getShifts(),
        api.getTimeOffRequests()
      ]);
      setAssignments(schedData.assignments || []);
      setShifts(Array.isArray(shiftsData) ? shiftsData : []);
      setWeekDates(getWeekDates(currentWeek));
      setTimeOffRequests(Array.isArray(toData) ? toData : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentWeek, userEmail]);

  useEffect(() => {
    if (isAdmin) loadAdminData();
    else loadDriverData();
  }, [isAdmin, loadAdminData, loadDriverData]);

  const prevWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - 7);
    setCurrentWeek(toISO(d));
  };
  const nextWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7);
    setCurrentWeek(toISO(d));
  };

  const getCellAssignments = (shiftId, date) => {
    const dateStr = toISO(date);
    return assignments.filter(a => a.shift_id === shiftId && a.work_date === dateStr);
  };

  const handleAddAssignment = async () => {
    if (!addEmpId || !showAddCell) return;
    setSaving(true);
    try {
      await api.createAssignment({
        employee_id: addEmpId,
        shift_id: showAddCell.shiftId,
        work_date: showAddCell.date,
        is_supervisor: addSupervisor
      });
      setShowAddCell(null);
      setAddEmpId('');
      setAddSupervisor(false);
      if (isAdmin) loadAdminData(); else loadDriverData();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async (id) => {
    await api.deleteAssignment(id);
    if (isAdmin) loadAdminData(); else loadDriverData();
  };

  const handleReviewTimeOff = async (id, status) => {
    await api.reviewTimeOffRequest(id, status);
    loadAdminData();
  };

  const handleSubmitTimeOff = async () => {
    setSaving(true);
    try {
      // Find the employee record matching this user's email
      const emps = await api.getEmployees({ search: userEmail });
      const emp = Array.isArray(emps) ? emps.find(e => e.email === userEmail) : null;
      if (!emp) throw new Error('Employee record not found for your email. Ask an admin to add you as an employee first.');
      await api.createTimeOffRequest({ employee_id: emp.id, ...timeOffForm });
      setShowTimeOffForm(false);
      setTimeOffForm({ start_date: '', end_date: '', reason: '' });
      loadDriverData();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const updated = await api.updateScheduleSettings(settingsForm);
      setSettings(updated);
      setShowSettings(false);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNotify = async (method) => {
    setNotifyMsg('Sending...');
    try {
      const res = await api.sendScheduleNotification(method);
      if (res.method === 'sms_not_configured') setNotifyMsg('SMS not configured (Twilio env vars missing)');
      else if (res.method === 'email_placeholder') setNotifyMsg(`Email placeholder — would notify ${res.count} drivers`);
      else setNotifyMsg(`Sent ${method.toUpperCase()} to ${res.sent || res.count || 0} drivers`);
      setTimeout(() => setNotifyMsg(''), 4000);
    } catch (e) {
      setNotifyMsg('Error: ' + e.message);
    }
  };

  const inputStyle = {
    background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8,
    color: '#f1f5f9', padding: '8px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box'
  };
  const btnPrimary = { background: '#47a141', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

  const weekLabel = weekDates.length === 7
    ? `Week of ${weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : '';

  if (error && (error.includes('does not exist') || error.includes('relation'))) {
    return (
      <div style={{ padding: 32, background: COLORS.bg, minHeight: '100vh', color: COLORS.text, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <Calendar size={48} color="#f59e0b" style={{ marginBottom: 16 }} />
          <h2 style={{ color: '#f59e0b', marginBottom: 8 }}>Database tables not found</h2>
          <p style={{ color: COLORS.muted }}>Run the SQL migration first. Open <code>supabase_migration_schedules.sql</code> in the repo root and paste it into the Supabase SQL editor.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, background: COLORS.bg, minHeight: '100vh', color: COLORS.text, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Calendar size={28} color={COLORS.accent} />
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Schedules</h1>
            <p style={{ margin: 0, color: COLORS.muted, fontSize: 14 }}>{weekLabel}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <>
              {notifyMsg && <span style={{ color: COLORS.muted, fontSize: 13 }}>{notifyMsg}</span>}
              <button onClick={() => handleNotify('sms')} style={{ ...btnPrimary, background: '#6366f1', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Send size={14} /> SMS Drivers
              </button>
              <button onClick={() => handleNotify('email')} style={{ ...btnPrimary, background: '#0ea5e9', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Send size={14} /> Email Drivers
              </button>
              <button onClick={() => setShowSettings(s => !s)} style={{ background: '#22263a', color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
                <Settings size={16} />
              </button>
            </>
          )}
          {!isAdmin && (
            <button onClick={() => alert('Email schedule: coming soon')} style={{ ...btnPrimary, background: '#0ea5e9', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Send size={14} /> Email My Schedule
            </button>
          )}
        </div>
      </div>

      {/* Settings Panel (admin) */}
      {isAdmin && showSettings && settings && (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Schedule Settings</h3>
            <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Min Notice Days</label>
              <input type="number" value={settingsForm.time_off_min_notice_days || 14}
                onChange={e => setSettingsForm(f => ({ ...f, time_off_min_notice_days: parseInt(e.target.value) }))}
                style={{ ...inputStyle, width: 80 }} />
            </div>
            <div>
              <label style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Auto Notify Day</label>
              <select value={settingsForm.auto_notify_day || 'sunday'} onChange={e => setSettingsForm(f => ({ ...f, auto_notify_day: e.target.value }))} style={{ ...inputStyle, width: 120 }}>
                {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
              </select>
            </div>
            {[['auto_notify_enabled','Auto Notify'],['notify_via_sms','SMS'],['notify_via_email','Email']].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: COLORS.text, fontSize: 14 }}>
                <input type="checkbox" checked={!!settingsForm[key]} onChange={e => setSettingsForm(f => ({ ...f, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}
            <button onClick={handleSaveSettings} disabled={saving} style={btnPrimary}>{saving ? 'Saving...' : 'Save Settings'}</button>
          </div>
        </div>
      )}

      {/* Week Navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={prevWeek} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{weekLabel}</span>
        <button onClick={nextWeek} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted }}>Loading...</div>}
      {error && !error.includes('does not exist') && !error.includes('relation') && <div style={{ color: '#ef4444', padding: 16 }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* Admin: Weekly Grid */}
          {isAdmin && (
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', width: 120 }}>Shift</th>
                    {weekDates.map(d => (
                      <th key={toISO(d)} style={{ padding: '12px 8px', textAlign: 'center', color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
                        {d.toLocaleDateString('en-US', { weekday: 'short' })}<br />
                        <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>{d.getDate()}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shifts.map(shift => (
                    <tr key={shift.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: shift.color }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{shift.name}</div>
                            <div style={{ color: COLORS.muted, fontSize: 11 }}>{shift.start_time}–{shift.end_time}</div>
                          </div>
                        </div>
                      </td>
                      {weekDates.map(d => {
                        const dateStr = toISO(d);
                        const cellAssignments = getCellAssignments(shift.id, d);
                        return (
                          <td key={dateStr} style={{ padding: 6, verticalAlign: 'top', minHeight: 60 }}>
                            <div style={{ minHeight: 50, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {cellAssignments.map(a => (
                                <div key={a.id} style={{
                                  background: '#22263a', border: `1px solid ${COLORS.border}`, borderRadius: 6,
                                  padding: '3px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4
                                }}>
                                  {a.is_supervisor && <Star size={10} color="#f59e0b" fill="#f59e0b" />}
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : '—'}
                                  </span>
                                  <button onClick={() => handleDeleteAssignment(a.id)} style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => setShowAddCell({ shiftId: shift.id, date: dateStr })}
                                style={{ background: 'none', border: `1px dashed ${COLORS.border}`, borderRadius: 6, color: COLORS.muted, fontSize: 11, cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3 }}
                              >
                                <Plus size={10} /> Add
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {shifts.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: COLORS.muted }}>
                        No shifts configured. Run the SQL migration to seed default shifts.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Driver: Own Schedule */}
          {!isAdmin && (
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Your Schedule This Week</h3>
              {assignments.length === 0 ? (
                <p style={{ color: COLORS.muted }}>No shifts scheduled for this week.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {assignments.map(a => (
                    <div key={a.id} style={{ background: '#22263a', border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: a.shifts?.color || '#3b82f6', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{a.shifts?.name || 'Shift'}</div>
                        <div style={{ color: COLORS.muted, fontSize: 13 }}>
                          {new Date(a.work_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                          {' · '}{a.shifts?.start_time}–{a.shifts?.end_time}
                        </div>
                      </div>
                      {a.is_supervisor && <span style={{ color: '#f59e0b', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Star size={12} fill="#f59e0b" /> Supervisor</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Time Off Requests */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Time-Off Requests</h3>
              {!isAdmin && (
                <button onClick={() => setShowTimeOffForm(true)} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} /> Request Time Off
                </button>
              )}
            </div>
            {timeOffRequests.length === 0 ? (
              <p style={{ color: COLORS.muted, margin: 0 }}>No time-off requests.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    {(isAdmin ? ['Employee', 'Dates', 'Reason', 'Status', 'Actions'] : ['Dates', 'Reason', 'Status']).map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeOffRequests.map(req => (
                    <tr key={req.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      {isAdmin && <td style={{ padding: '10px 12px', fontSize: 14 }}>{req.employees ? `${req.employees.first_name} ${req.employees.last_name}` : '—'}</td>}
                      <td style={{ padding: '10px 12px', fontSize: 14 }}>{req.start_date} – {req.end_date}</td>
                      <td style={{ padding: '10px 12px', fontSize: 14, color: COLORS.muted }}>{req.reason || '—'}</td>
                      <td style={{ padding: '10px 12px' }}><StatusBadge status={req.status} /></td>
                      {isAdmin && req.status === 'pending' && (
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => handleReviewTimeOff(req.id, 'approved')} style={{ background: '#47a14122', color: '#47a141', border: '1px solid #47a14144', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle size={12} /> Approve
                            </button>
                            <button onClick={() => handleReviewTimeOff(req.id, 'denied')} style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <XCircle size={12} /> Deny
                            </button>
                          </div>
                        </td>
                      )}
                      {isAdmin && req.status !== 'pending' && (
                        <td style={{ padding: '10px 12px', color: COLORS.muted, fontSize: 13 }}>{req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString() : '—'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Add Assignment Modal */}
      {showAddCell && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 28, width: 360 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Add to {shifts.find(s => s.id === showAddCell.shiftId)?.name}</h3>
              <button onClick={() => setShowAddCell(null)} style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Employee</label>
              <select value={addEmpId} onChange={e => setAddEmpId(e.target.value)} style={{ background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 14, width: '100%' }}>
                <option value="">Select employee...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={addSupervisor} onChange={e => setAddSupervisor(e.target.checked)} />
              <Star size={14} color="#f59e0b" /> Supervisor
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAddAssignment} disabled={saving || !addEmpId} style={{ ...btnPrimary, flex: 1 }}>{saving ? 'Adding...' : 'Add'}</button>
              <button onClick={() => setShowAddCell(null)} style={{ background: '#22263a', color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Time Off Request Form (driver) */}
      {showTimeOffForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 28, width: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Request Time Off</h3>
              <button onClick={() => setShowTimeOffForm(false)} style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            {[['start_date', 'Start Date', 'date'], ['end_date', 'End Date', 'date'], ['reason', 'Reason', 'text']].map(([key, label, type]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</label>
                <input type={type} value={timeOffForm[key]} onChange={e => setTimeOffForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ background: '#0f1117', border: '1px solid #2e3347', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSubmitTimeOff} disabled={saving || !timeOffForm.start_date || !timeOffForm.end_date} style={{ ...btnPrimary, flex: 1 }}>{saving ? 'Submitting...' : 'Submit Request'}</button>
              <button onClick={() => setShowTimeOffForm(false)} style={{ background: '#22263a', color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
