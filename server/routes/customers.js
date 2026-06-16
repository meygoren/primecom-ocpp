const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

async function getUser(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  return user || null;
}

async function getRole(user) {
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return data?.role || 'viewer';
}

// GET /api/customers
router.get('/', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase.from('customer_accounts').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/customers
router.post('/', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const role = await getRole(user);
  if (role !== 'admin' && role !== 'operator') return res.status(403).json({ error: 'Not authorized' });
  const { data, error } = await supabase.from('customer_accounts').insert(req.body).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/customers/:id
router.patch('/:id', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const role = await getRole(user);
  if (role !== 'admin' && role !== 'operator') return res.status(403).json({ error: 'Not authorized' });
  const { data, error } = await supabase
    .from('customer_accounts').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const role = await getRole(user);
  if (role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { error } = await supabase.from('customer_accounts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
