const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const connections = require('../state/connections');
const { getConnectorLiveData } = require('../utils/liveData');

// GET /api/chargers/connected-ids — expose the in-memory connections map keys
// Lets the dashboard diagnose ID mismatches between the DB and WebSocket URLs.
router.get('/connected-ids', (_req, res) => {
  res.json({ connected: Array.from(connections.keys()) });
});

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

  const connectors_live = await getConnectorLiveData(id);
  res.json({ ...data, connected: connections.has(id), connectors_live });
});

// PATCH /api/chargers/:id — update label or notes
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { location_label, notes, connector_count, rated_kw, auto_start_enabled, auto_start_id_tag, show_on_dashboard } = req.body;

  const updates = {};
  if (location_label !== undefined) updates.location_label = location_label;
  if (notes !== undefined) updates.notes = notes;
  if (connector_count !== undefined) updates.connector_count = connector_count;
  if (rated_kw !== undefined) updates.rated_kw = rated_kw !== '' ? parseFloat(rated_kw) : null;
  if (auto_start_enabled !== undefined) updates.auto_start_enabled = auto_start_enabled;
  if (auto_start_id_tag !== undefined) updates.auto_start_id_tag = auto_start_id_tag || null;
  if (show_on_dashboard !== undefined) updates.show_on_dashboard = show_on_dashboard;

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
