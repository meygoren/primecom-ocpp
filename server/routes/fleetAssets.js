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

// GET /api/fleet-assets/vehicles
router.get('/vehicles', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase.from('fleet_vehicles').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/fleet-assets/vehicles/:id
router.patch('/vehicles/:id', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('fleet_vehicles').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/fleet-assets/maintenance
router.get('/maintenance', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { vehicle_id } = req.query;
  let q = supabase
    .from('maintenance_logs')
    .select('*, fleet_vehicles(name, vehicle_type)')
    .order('date', { ascending: false });
  if (vehicle_id) q = q.eq('vehicle_id', vehicle_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/fleet-assets/maintenance
router.post('/maintenance', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('maintenance_logs').insert(req.body).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/fleet-assets/maintenance/:id
router.patch('/maintenance/:id', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('maintenance_logs').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/fleet-assets/maintenance/:id
router.delete('/maintenance/:id', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { error } = await supabase.from('maintenance_logs').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
