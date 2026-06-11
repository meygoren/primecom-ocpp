const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// GET /api/logs — list OCPP message logs
// Query params: charger_id, limit (default 100), offset (default 0)
router.get('/', async (req, res) => {
  const { charger_id, limit = 100, offset = 0 } = req.query;

  let query = supabase
    .from('ocpp_logs')
    .select('*')
    .order('created_at', { ascending: false })
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

module.exports = router;
