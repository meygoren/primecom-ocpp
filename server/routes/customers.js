const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { requireAuth } = require('./me');

// GET /api/customers
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('customer_accounts')
    .select('*')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/customers
router.post('/', requireAuth, async (req, res) => {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'operator') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  const { data, error } = await supabase
    .from('customer_accounts')
    .insert(req.body)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/customers/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'operator') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  const { data, error } = await supabase
    .from('customer_accounts')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/customers/:id
router.delete('/:id', requireAuth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { error } = await supabase
    .from('customer_accounts')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
