const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// ── Auth + role helper ────────────────────────────────────────────────────────
async function getUserWithRole(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return { user: null, role: null };
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  if (!user) return { user: null, role: null };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return { user, role: profile?.role || 'viewer', profile: profile || {} };
}

function isAdmin(role) {
  return role === 'admin' || role === 'operator';
}

// ── Settings helpers ──────────────────────────────────────────────────────────
async function getSettings() {
  const { data } = await supabase
    .from('expense_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  return data || {
    id: 1,
    accounting_emails: [],
    auto_notify_accounting: true,
    require_receipt_over: 25.0,
  };
}

// ── GET /api/expenses/settings ────────────────────────────────────────────────
router.get('/settings', async (_req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/expenses/settings ──────────────────────────────────────────────
router.patch('/settings', async (req, res) => {
  try {
    const { role } = await getUserWithRole(req);
    if (!isAdmin(role)) return res.status(403).json({ error: 'Admin only.' });

    const allowed = ['accounting_emails', 'auto_notify_accounting', 'require_receipt_over'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const { data, error } = await supabase
      .from('expense_settings')
      .upsert({ id: 1, ...updates })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/expenses/stats ───────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { user, role } = await getUserWithRole(req);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    // Pending count (admin: all; user: their own)
    let pendingQ = supabase.from('expenses').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    if (!isAdmin(role) && user) pendingQ = pendingQ.eq('submitter_email', user.email);
    const { count: pendingCount } = await pendingQ;

    // Approved this month total amount
    let approvedQ = supabase.from('expenses').select('amount').eq('status', 'approved').gte('date', monthStart);
    if (!isAdmin(role) && user) approvedQ = approvedQ.eq('submitter_email', user.email);
    const { data: approvedRows } = await approvedQ;
    const approvedTotal = (approvedRows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

    // My submissions this month
    let mineCount = 0;
    if (user) {
      const { count } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .eq('submitter_email', user.email)
        .gte('date', monthStart);
      mineCount = count || 0;
    }

    // Count by category (scoped same as visibility)
    let catQ = supabase.from('expenses').select('category, amount');
    if (!isAdmin(role) && user) catQ = catQ.eq('submitter_email', user.email);
    const { data: catRows } = await catQ;
    const byCategory = {};
    for (const r of catRows || []) {
      byCategory[r.category] = (byCategory[r.category] || 0) + (Number(r.amount) || 0);
    }

    res.json({
      pending_count: pendingCount || 0,
      approved_total_month: Math.round(approvedTotal * 100) / 100,
      my_submissions_month: mineCount,
      by_category: byCategory,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/expenses — list (admin: all; user: own) ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const { user, role } = await getUserWithRole(req);
    const { status, category, limit = 200 } = req.query;

    let q = supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (!isAdmin(role)) {
      // Non-admins only see their own
      if (!user) return res.json([]);
      q = q.eq('submitter_email', user.email);
    }
    if (status)   q = q.eq('status', status);
    if (category) q = q.eq('category', category);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/expenses — submit new expense ───────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { user } = await getUserWithRole(req);
    const {
      date, description, category, amount,
      payment_method, receipt_url, authorized_by, submitter_name,
    } = req.body;

    if (!date) return res.status(400).json({ error: 'Date is required.' });
    if (!description) return res.status(400).json({ error: 'Description is required.' });
    if (!category) return res.status(400).json({ error: 'Category is required.' });
    if (amount == null || isNaN(Number(amount))) return res.status(400).json({ error: 'A valid amount is required.' });

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        submitted_by:   user?.id || null,
        submitter_name: submitter_name || user?.email || null,
        submitter_email: user?.email || null,
        date,
        description,
        category,
        amount: Number(amount),
        payment_method: payment_method || null,
        receipt_url:    receipt_url || null,
        authorized_by:  authorized_by || null,
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;

    // Notify accounting (placeholder — log only)
    try {
      const settings = await getSettings();
      if (settings.auto_notify_accounting && (settings.accounting_emails || []).length) {
        console.log(`[Expenses] Would email ${settings.accounting_emails.join(', ')} about new expense from ${data.submitter_name || 'unknown'} ($${data.amount} — ${data.category})`);
      }
    } catch (e) {
      console.error('[Expenses] Notify error:', e.message);
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('[Expenses] Create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/expenses/:id ───────────────────────────────────────────────────
// Admin: any field including status. User: only own pending, limited fields.
router.patch('/:id', async (req, res) => {
  try {
    const { user, role } = await getUserWithRole(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: existing, error: fetchErr } = await supabase
      .from('expenses').select('*').eq('id', req.params.id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Expense not found.' });

    let updates = {};
    if (isAdmin(role)) {
      const allowed = ['status', 'reviewer_notes', 'date', 'description', 'category', 'amount', 'payment_method', 'receipt_url', 'authorized_by'];
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      if (updates.status === 'approved' || updates.status === 'denied') {
        updates.reviewed_at = new Date().toISOString();
      }
    } else {
      // Regular user: only their own, only while pending
      if (existing.submitter_email !== user.email) return res.status(403).json({ error: 'You can only edit your own expenses.' });
      if (existing.status !== 'pending') return res.status(403).json({ error: 'Only pending expenses can be edited.' });
      const allowed = ['date', 'description', 'category', 'amount', 'payment_method', 'receipt_url', 'authorized_by'];
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
    }

    const { data, error } = await supabase
      .from('expenses').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/expenses/:id — delete own pending (admin: any) ─────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { user, role } = await getUserWithRole(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: existing } = await supabase
      .from('expenses').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Expense not found.' });

    if (!isAdmin(role)) {
      if (existing.submitter_email !== user.email) return res.status(403).json({ error: 'You can only delete your own expenses.' });
      if (existing.status !== 'pending') return res.status(403).json({ error: 'Only pending expenses can be deleted.' });
    }

    const { error } = await supabase.from('expenses').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
