const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// GET /api/sessions/active/:chargerId — current open session (no stop_time)
// Used by the command panel to auto-fill the Remote Stop transaction ID.
router.get('/active/:chargerId', async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('charger_id', req.params.chargerId)
    .is('stop_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || null);
});

// GET /api/sessions — list sessions with optional filters
// Query params: charger_id, limit (default 100), offset (default 0)
router.get('/', async (req, res) => {
  const { charger_id, limit = 100, offset = 0 } = req.query;

  let query = supabase
    .from('sessions')
    .select('*')
    .order('start_time', { ascending: false })
    .limit(parseInt(limit))
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (charger_id) {
    query = query.eq('charger_id', charger_id);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// GET /api/sessions/:transactionId — single session
router.get('/:transactionId', async (req, res) => {
  const { transactionId } = req.params;

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('transaction_id', parseInt(transactionId))
    .single();

  if (error) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(data);
});

module.exports = router;
