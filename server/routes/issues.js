const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getUser(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  return user || null;
}

// ── Settings helpers ──────────────────────────────────────────────────────────
async function getSettings() {
  const { data } = await supabase
    .from('issue_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  return data || {
    low_enabled:     false,
    medium_enabled:  true,
    high_enabled:    true,
    low_emails:      [],
    medium_emails:   [],
    high_emails:     [],
  };
}

// ── Email on new issue ────────────────────────────────────────────────────────
async function notifyOnCreate(issue) {
  try {
    const settings = await getSettings();
    const key      = `${issue.priority}_enabled`;
    const emailKey = `${issue.priority}_emails`;

    if (!settings[key]) return;
    const emails = settings[emailKey] || [];
    if (!emails.length) return;

    const { sendEmail } = require('../services/alertService');
    const subject = `[${issue.priority.toUpperCase()} Priority] New Issue — ${issue.title || issue.category}`;
    const lines = [
      `A new issue has been reported on the Primecom platform.`,
      ``,
      `Priority  : ${issue.priority.toUpperCase()}`,
      `Category  : ${issue.category}`,
      `Title     : ${issue.title || '(no title)'}`,
      issue.truck_number ? `Truck     : Truck ${issue.truck_number}` : null,
      issue.truck_side   ? `Side      : ${issue.truck_side}`         : null,
      issue.cable        ? `Cable     : ${issue.cable}`               : null,
      `Reported by: ${issue.reporter_name || 'Unknown'}`,
      ``,
      `Description:`,
      issue.description || '(no description)',
      ``,
      issue.photo_url ? `Photo: ${issue.photo_url}` : null,
      ``,
      `View in Primecom OCPP Platform → /issues`,
    ].filter((l) => l !== null).join('\n');

    for (const email of emails) {
      await sendEmail(email, subject, lines);
    }
    console.log(`[Issues] Notification sent for ${issue.priority} issue to: ${emails.join(', ')}`);
  } catch (err) {
    console.error('[Issues] Notification error:', err.message);
  }
}

// ── GET /api/issues — list issues ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, priority, limit = 100, offset = 0 } = req.query;

    let q = supabase
      .from('issues')
      .select('*')
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status)   q = q.eq('status', status);
    if (priority) q = q.eq('priority', priority);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/issues/open-count — badge number ─────────────────────────────────
router.get('/open-count', async (_req, res) => {
  try {
    const { count, error } = await supabase
      .from('issues')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']);
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/issues — create issue ──────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const user = await getUser(req);
    const {
      truck_number, truck_side, cable, category,
      title, description, photo_url, priority,
      reporter_name,
    } = req.body;

    if (!description && !title) return res.status(400).json({ error: 'Description is required.' });
    if (!['low', 'medium', 'high'].includes(priority)) return res.status(400).json({ error: 'Invalid priority.' });

    const { data, error } = await supabase
      .from('issues')
      .insert({
        truck_number:  truck_number || null,
        truck_side:    truck_side   || null,
        cable:         cable        || null,
        category:      category     || 'other',
        title:         title        || null,
        description:   description  || null,
        photo_url:     photo_url    || null,
        priority,
        status:        'open',
        reported_by:   user?.id    || null,
        reporter_name: reporter_name || user?.email || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Fire notifications async — don't block the response
    notifyOnCreate(data).catch(() => {});

    res.status(201).json(data);
  } catch (err) {
    console.error('[Issues] Create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/issues/:id — update status, assignment, notes ─────────────────
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['status', 'assigned_to', 'resolution_notes', 'priority', 'title', 'description'];
    const updates = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.status === 'resolved' || updates.status === 'closed') {
      updates.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('issues')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/issues/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('issues').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/issues/settings ──────────────────────────────────────────────────
router.get('/settings', async (_req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/issues/settings ────────────────────────────────────────────────
router.patch('/settings', async (req, res) => {
  try {
    const allowed = ['low_enabled', 'medium_enabled', 'high_enabled', 'low_emails', 'medium_emails', 'high_emails'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const existing = await getSettings();
    let data;
    if (existing.id) {
      ({ data } = await supabase.from('issue_settings').update(updates).eq('id', existing.id).select().single());
    } else {
      ({ data } = await supabase.from('issue_settings').insert(updates).select().single());
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
