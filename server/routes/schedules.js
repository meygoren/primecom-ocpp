const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

function getWeekRange(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const day = date.getDay(); // 0=Sun
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Mon
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10)
  };
}

// GET /api/schedules?week=2025-06-16
router.get('/', async (req, res) => {
  try {
    const { week } = req.query;
    const { start, end } = getWeekRange(week);
    const { data, error } = await supabase
      .from('schedule_assignments')
      .select(`*, employees(id, first_name, last_name, role), shifts(id, name, start_time, end_time, color)`)
      .gte('work_date', start)
      .lte('work_date', end)
      .order('work_date');
    if (error) throw error;
    res.json({ assignments: data, week_start: start, week_end: end });
  } catch (err) {
    console.error('GET /schedules error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schedules/my?email=...&week=...
router.get('/my', async (req, res) => {
  try {
    const { email, week } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });
    const { data: emp, error: empErr } = await supabase.from('employees').select('id').eq('email', email).single();
    if (empErr || !emp) return res.status(404).json({ error: 'Employee not found' });
    const { start, end } = getWeekRange(week);
    const { data, error } = await supabase
      .from('schedule_assignments')
      .select(`*, shifts(id, name, start_time, end_time, color)`)
      .eq('employee_id', emp.id)
      .gte('work_date', start)
      .lte('work_date', end)
      .order('work_date');
    if (error) throw error;
    res.json({ assignments: data, week_start: start, week_end: end });
  } catch (err) {
    console.error('GET /schedules/my error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/schedules/assignments
router.post('/assignments', async (req, res) => {
  try {
    const { employee_id, shift_id, work_date, is_supervisor, notes } = req.body;
    const { data, error } = await supabase.from('schedule_assignments').insert([{
      employee_id, shift_id, work_date, is_supervisor: !!is_supervisor, notes
    }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('POST /schedules/assignments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/schedules/assignments/:id
router.delete('/assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('schedule_assignments').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /schedules/assignments/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schedules/time-off
router.get('/time-off', async (req, res) => {
  try {
    const { employee_id } = req.query;
    let query = supabase.from('time_off_requests').select(`*, employees(first_name, last_name)`).order('created_at', { ascending: false });
    if (employee_id) query = query.eq('employee_id', employee_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('GET /schedules/time-off error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/schedules/time-off
router.post('/time-off', async (req, res) => {
  try {
    const { employee_id, start_date, end_date, reason } = req.body;
    const { data, error } = await supabase.from('time_off_requests').insert([{
      employee_id, start_date, end_date, reason, status: 'pending'
    }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('POST /schedules/time-off error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/schedules/time-off/:id
router.patch('/time-off/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['approved', 'denied'].includes(status)) return res.status(400).json({ error: 'status must be approved or denied' });
    const { data, error } = await supabase.from('time_off_requests').update({
      status, reviewed_at: new Date().toISOString()
    }).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('PATCH /schedules/time-off/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schedules/settings
router.get('/settings', async (req, res) => {
  try {
    const { data, error } = await supabase.from('schedule_settings').select('*').eq('id', 1).single();
    if (error) throw error;
    res.json(data || {
      id: 1, time_off_min_notice_days: 14, auto_notify_enabled: false,
      auto_notify_day: 'sunday', notify_via_sms: true, notify_via_email: true
    });
  } catch (err) {
    console.error('GET /schedules/settings error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/schedules/settings
router.patch('/settings', async (req, res) => {
  try {
    const updates = req.body;
    const { data, error } = await supabase.from('schedule_settings').upsert({ id: 1, ...updates }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('PATCH /schedules/settings error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/schedules/notify
router.post('/notify', async (req, res) => {
  try {
    const { method } = req.body; // 'sms' | 'email'
    const { data: employees, error: empErr } = await supabase.from('employees').select('phone, email, first_name').eq('active', true).eq('role', 'driver');
    if (empErr) throw empErr;

    if (method === 'sms') {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
      if (!twilioSid || !twilioToken || !twilioFrom) {
        console.log('[schedules/notify] Twilio not configured, skipping SMS');
        return res.json({ ok: true, method: 'sms_not_configured', count: 0 });
      }
      const twilio = require('twilio')(twilioSid, twilioToken);
      let sent = 0;
      for (const emp of employees) {
        if (emp.phone) {
          try {
            await twilio.messages.create({
              body: `Hi ${emp.first_name}, your schedule has been updated. Please check the Primecom portal for details.`,
              from: twilioFrom,
              to: emp.phone
            });
            sent++;
          } catch (smsErr) {
            console.error(`SMS to ${emp.phone} failed:`, smsErr.message);
          }
        }
      }
      return res.json({ ok: true, method: 'sms', sent });
    }

    if (method === 'email') {
      console.log('[schedules/notify] Email notification placeholder - would send to', employees.length, 'drivers');
      return res.json({ ok: true, method: 'email_placeholder', count: employees.length });
    }

    res.status(400).json({ error: 'method must be sms or email' });
  } catch (err) {
    console.error('POST /schedules/notify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schedules/shifts
router.get('/shifts', async (req, res) => {
  try {
    const { data, error } = await supabase.from('shifts').select('*').order('start_time');
    if (error) throw error;
    // Return hardcoded fallback if table empty or doesn't exist
    if (!data || data.length === 0) {
      return res.json([
        { id: 'day', name: 'Day Shift', start_time: '06:00', end_time: '18:00', color: '#3b82f6' },
        { id: 'night', name: 'Night Shift', start_time: '18:00', end_time: '06:00', color: '#6366f1' }
      ]);
    }
    res.json(data);
  } catch (err) {
    console.error('GET /schedules/shifts error:', err.message);
    // Graceful fallback if table doesn't exist
    res.json([
      { id: 'day', name: 'Day Shift', start_time: '06:00', end_time: '18:00', color: '#3b82f6' },
      { id: 'night', name: 'Night Shift', start_time: '18:00', end_time: '06:00', color: '#6366f1' }
    ]);
  }
});

module.exports = router;
