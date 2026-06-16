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

// GET /api/incidents
router.get('/', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { status, severity, vehicle_id } = req.query;
  let q = supabase
    .from('incident_reports')
    .select('*, fleet_vehicles(unit_id)')
    .order('date', { ascending: false });
  if (status)     q = q.eq('status', status);
  if (severity)   q = q.eq('severity', severity);
  if (vehicle_id) q = q.eq('vehicle_id', vehicle_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/incidents/open-count
router.get('/open-count', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { count, error } = await supabase
    .from('incident_reports')
    .select('*', { count: 'exact', head: true })
    .in('status', ['open', 'under_review']);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count: count || 0 });
});

// POST /api/incidents
router.post('/', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const payload = { ...req.body, reported_by: req.body.reported_by || user.email };
  const { data, error } = await supabase.from('incident_reports').insert(payload).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/incidents/:id
router.patch('/:id', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('incident_reports').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/incidents/:id
router.delete('/:id', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const role = await getRole(user);
  if (role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { error } = await supabase.from('incident_reports').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
