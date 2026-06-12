const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

async function getUserFromReq(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  return user || null;
}

// GET /api/me — current user profile + role
router.get('/', async (req, res) => {
  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  res.json({ id: user.id, email: user.email, profile: profile || { role: 'user' } });
});

// GET /api/me/chargers — chargers visible to this user
// Admins get all chargers; regular users get only assigned chargers
router.get('/chargers', async (req, res) => {
  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  if (profile?.role === 'admin') {
    const { data } = await supabase.from('chargers').select('*').order('charger_id');
    return res.json(data || []);
  }

  const { data: assignments } = await supabase
    .from('charger_assignments')
    .select('charger_id')
    .eq('user_id', user.id);

  const ids = (assignments || []).map((a) => a.charger_id);
  if (!ids.length) return res.json([]);

  const { data: chargers } = await supabase.from('chargers').select('*').in('charger_id', ids);
  res.json(chargers || []);
});

module.exports = router;
