const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const connections = require('../state/connections');

// GET /api/chargers — list all chargers with online status
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('chargers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Annotate with live WebSocket connection status
  const result = data.map((c) => ({
    ...c,
    connected: connections.has(c.charger_id),
  }));

  res.json(result);
});

// GET /api/chargers/:id/firmware — firmware update history
router.get('/:id/firmware', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('firmware_updates')
    .select('*')
    .eq('charger_id', id)
    .order('requested_at', { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/chargers/:id — single charger detail
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('chargers')
    .select('*')
    .eq('charger_id', id)
    .single();

  if (error) {
    return res.status(404).json({ error: 'Charger not found' });
  }

  res.json({ ...data, connected: connections.has(id) });
});

// PATCH /api/chargers/:id — update label or notes
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { location_label, notes, connector_count, rated_kw } = req.body;

  const updates = {};
  if (location_label !== undefined) updates.location_label = location_label;
  if (notes !== undefined) updates.notes = notes;
  if (connector_count !== undefined) updates.connector_count = connector_count;
  if (rated_kw !== undefined) updates.rated_kw = rated_kw !== '' ? parseFloat(rated_kw) : null;

  const { data, error } = await supabase
    .from('chargers')
    .update(updates)
    .eq('charger_id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

module.exports = router;
