const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// GET /api/ef-supervisors/settings
router.get('/settings', async (req, res) => {
  const { data, error } = await supabase.from('ef_settings').select('*').limit(1).single();
  if (error) return res.json({ soc_alerts_enabled: true });
  res.json(data);
});

// PUT /api/ef-supervisors/settings
router.put('/settings', async (req, res) => {
  const { soc_alerts_enabled, custom_message } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (soc_alerts_enabled !== undefined) updates.soc_alerts_enabled = soc_alerts_enabled;
  if (custom_message !== undefined) updates.custom_message = custom_message;

  const { data: existing } = await supabase.from('ef_settings').select('id').limit(1).single();
  if (existing) {
    await supabase.from('ef_settings').update(updates).eq('id', existing.id);
  } else {
    await supabase.from('ef_settings').insert({ soc_alerts_enabled: true, custom_message: custom_message || null });
  }
  res.json({ ok: true });
});

// POST /api/ef-supervisors/test-sms
router.post('/test-sms', async (req, res) => {
  const { data: supervisors } = await supabase.from('ef_supervisors').select('*').eq('active', true);
  if (!supervisors?.length) return res.status(400).json({ error: 'No active supervisors to send to' });

  const { sendSms } = require('../services/alertService');
  const msg = 'Primecom OCPP — Test alert: SMS notifications are working correctly.';
  let sent = 0;
  for (const sup of supervisors) {
    if (sup.phone) { await sendSms(sup.phone, msg); sent++; }
  }
  res.json({ ok: true, sent, recipients: supervisors.filter((s) => s.phone).map((s) => s.name) });
});

// GET /api/ef-supervisors — list all supervisors
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('ef_supervisors')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/ef-supervisors — create supervisor
router.post('/', async (req, res) => {
  const { name, phone, email } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await supabase
    .from('ef_supervisors')
    .insert({ name, phone: phone || null, email: email || null, active: true })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/ef-supervisors/:id — update supervisor
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, active } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (active !== undefined) updates.active = active;

  const { data, error } = await supabase
    .from('ef_supervisors')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/ef-supervisors/:id — delete supervisor
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('ef_supervisors')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
