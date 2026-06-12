const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

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
