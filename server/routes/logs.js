const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// GET /api/logs — list OCPP message logs
// Query params: charger_id, charger_ids (comma-separated), limit (default 100), offset (default 0)
router.get('/', async (req, res) => {
  const { charger_id, charger_ids, limit = 100, offset = 0 } = req.query;

  let query = supabase
    .from('ocpp_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(parseInt(limit))
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (charger_id) {
    query = query.eq('charger_id', charger_id);
  } else if (charger_ids !== undefined) {
    // Comma-separated list — used to scope the Logs page to one location.
    const ids = String(charger_ids).split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return res.json([]);
    query = query.in('charger_id', ids);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

module.exports = router;
