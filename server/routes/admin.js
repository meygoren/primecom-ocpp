const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const requireAdmin = require('../middleware/requireAdmin');

router.use(requireAdmin);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  // Pull all auth users so newly created users always appear even without a profile row
  const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (authError) return res.status(500).json({ error: authError.message });

  const { data: profiles } = await supabase.from('profiles').select('*');
  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  const merged = authUsers.map((u) => {
    const p = profileMap[u.id] || {};
    return {
      id: u.id,
      email: u.email,
      full_name: p.full_name || u.user_metadata?.full_name || '',
      role: p.role || 'viewer',
      created_at: u.created_at,
    };
  });

  merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  res.json(merged);
});

// POST /api/admin/users — create a new user
router.post('/users', async (req, res) => {
  const { email, password, full_name, role = 'viewer' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const { data: { user }, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || '' },
  });
  if (error) return res.status(400).json({ error: error.message });

  // Upsert profile (trigger may or may not have fired yet)
  await supabase.from('profiles').upsert({
    id: user.id,
    email,
    full_name: full_name || '',
    role,
  });

  res.json({ id: user.id, email, full_name: full_name || '', role });
});

// PATCH /api/admin/users/:id — update role or full_name
router.patch('/users/:id', async (req, res) => {
  const update = {};
  if (req.body.role !== undefined) update.role = req.body.role;
  if (req.body.full_name !== undefined) update.full_name = req.body.full_name;
  const { error } = await supabase.from('profiles').update(update).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  // Prevent self-deletion
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// GET /api/admin/users/:id/chargers — assigned charger IDs
router.get('/users/:id/chargers', async (req, res) => {
  const { data, error } = await supabase
    .from('charger_assignments')
    .select('charger_id')
    .eq('user_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map((r) => r.charger_id));
});

// PUT /api/admin/users/:id/chargers — replace all assignments
router.put('/users/:id/chargers', async (req, res) => {
  const { charger_ids = [] } = req.body;

  await supabase.from('charger_assignments').delete().eq('user_id', req.params.id);

  if (charger_ids.length > 0) {
    const { error } = await supabase.from('charger_assignments').insert(
      charger_ids.map((cid) => ({ user_id: req.params.id, charger_id: cid }))
    );
    if (error) return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
});

module.exports = router;
