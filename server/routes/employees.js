const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// GET /api/employees
router.get('/', async (req, res) => {
  try {
    const { role, active, search } = req.query;
    let query = supabase.from('employees').select('*').order('last_name');
    if (role) query = query.eq('role', role);
    if (active !== undefined) query = query.eq('active', active === 'true');
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('GET /employees error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees
router.post('/', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, address, role, user_id, cdl_url, notes, active } = req.body;
    const { data, error } = await supabase.from('employees').insert([{
      first_name, last_name, email, phone, address,
      role: role || 'driver', user_id, cdl_url, notes,
      active: active !== undefined ? active : true
    }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('POST /employees error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/employees/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    delete updates.id;
    delete updates.created_at;
    const { data, error } = await supabase.from('employees').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('PATCH /employees/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employees/:id — soft delete
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('employees').update({ active: false }).eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /employees/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
