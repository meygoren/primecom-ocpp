const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { requireAuth } = require('./me');

// GET /api/incidents
router.get('/', requireAuth, async (req, res) => {
  const { status, severity, vehicle_id } = req.query;
  let q = supabase
    .from('incident_reports')
    .select('*, fleet_vehicles(name, vehicle_type)')
    .order('date', { ascending: false });
  if (status)     q = q.eq('status', status);
  if (severity)   q = q.eq('severity', severity);
  if (vehicle_id) q = q.eq('vehicle_id', vehicle_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/incidents/open-count
router.get('/open-count', requireAuth, async (req, res) => {
  const { count, error } = await supabase
    .from('incident_reports')
    .select('*', { count: 'exact', head: true })
    .in('status', ['open', 'under_review']);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count: count || 0 });
});

// POST /api/incidents
router.post('/', requireAuth, async (req, res) => {
  const payload = { ...req.body, reported_by: req.body.reported_by || req.user?.email };
  const { data, error } = await supabase
    .from('incident_reports')
    .insert(payload)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/incidents/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('incident_reports')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/incidents/:id
router.delete('/:id', requireAuth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { error } = await supabase
    .from('incident_reports')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
