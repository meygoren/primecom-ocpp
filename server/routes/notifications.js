const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

async function getUser(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  return user || null;
}

// GET /api/notifications
router.get('/', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data } = await supabase
    .from('notifications').select('*').eq('user_id', user.id)
    .order('created_at', { ascending: false }).limit(50);
  res.json(data || []);
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  await supabase.from('notifications').update({ read: true }).eq('id', req.params.id).eq('user_id', user.id);
  res.json({ ok: true });
});

// POST /api/notifications/read-all
router.post('/read-all', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  await supabase.from('notifications').update({ read: true }).eq('user_id', user.id);
  res.json({ ok: true });
});

// GET /api/notifications/preferences
router.get('/preferences', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data } = await supabase.from('driver_preferences').select('*').eq('user_id', user.id).single();
  res.json(data || { soc_threshold: 90, notify_complete: true, notify_fault: true });
});

// PUT /api/notifications/preferences
router.put('/preferences', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { soc_threshold, notify_complete, notify_fault } = req.body;
  const { error } = await supabase.from('driver_preferences').upsert({
    user_id: user.id,
    soc_threshold: soc_threshold ?? 90,
    notify_complete: notify_complete ?? true,
    notify_fault: notify_fault ?? true,
    updated_at: new Date().toISOString(),
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
