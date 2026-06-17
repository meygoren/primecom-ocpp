const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

async function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return { ...user, role: profile?.role || 'viewer' };
}

function canAccess(role) {
  return role === 'admin' || role === 'lawyer';
}

// Fetch DocuSign settings from DB
async function getSettings() {
  const { data } = await supabase
    .from('legal_settings')
    .select('*')
    .order('id', { ascending: false })
    .limit(1)
    .single();
  return data || null;
}

// DocuSign API request helper
async function dsRequest(settings, method, path, body) {
  const base = settings.docusign_base_url || 'https://demo.docusign.net';
  const accountId = settings.docusign_account_id;
  const url = `${base}/restapi/v2.1/accounts/${accountId}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${settings.docusign_access_token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `DocuSign error ${res.status}`);
  return data;
}

// GET /api/legal/settings
router.get('/settings', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  const settings = await getSettings();
  if (!settings) return res.json({ configured: false });

  // Redact token before sending to client
  res.json({
    configured: true,
    docusign_account_id: settings.docusign_account_id,
    docusign_base_url: settings.docusign_base_url,
    nda_template_id: settings.nda_template_id,
    counsel_emails: settings.counsel_emails || [],
    has_token: !!settings.docusign_access_token,
    custom_templates: settings.custom_templates || [],
  });
});

// PUT /api/legal/settings
router.put('/settings', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  const {
    docusign_access_token,
    docusign_account_id,
    docusign_base_url,
    nda_template_id,
    counsel_emails,
    custom_templates,
  } = req.body;

  const existing = await getSettings();
  const updates = {
    docusign_account_id: docusign_account_id || null,
    docusign_base_url: docusign_base_url || 'https://demo.docusign.net',
    nda_template_id: nda_template_id || null,
    counsel_emails: counsel_emails || [],
    custom_templates: custom_templates || [],
    updated_at: new Date().toISOString(),
  };
  // Only update token if one was provided
  if (docusign_access_token) updates.docusign_access_token = docusign_access_token;

  let result;
  if (existing) {
    result = await supabase.from('legal_settings').update(updates).eq('id', existing.id).select().single();
  } else {
    result = await supabase.from('legal_settings').insert(updates).select().single();
  }

  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json({ ok: true });
});

// GET /api/legal/templates — list DocuSign templates
router.get('/templates', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  const settings = await getSettings();
  if (!settings?.docusign_access_token) return res.status(400).json({ error: 'DocuSign not configured' });

  try {
    const data = await dsRequest(settings, 'GET', '/templates?folder_types=mine&count=20');
    const templates = (data.envelopeTemplates || []).map((t) => ({
      templateId: t.templateId,
      name: t.name,
      description: t.description || '',
    }));
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/legal/documents — list all documents from DB
router.get('/documents', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  const { data, error } = await supabase
    .from('legal_documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/legal/send — send a document from a DocuSign template
router.post('/send', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  const { template_id, template_name, recipient_name, recipient_email, subject, message } = req.body;
  if (!template_id || !recipient_name || !recipient_email) {
    return res.status(400).json({ error: 'template_id, recipient_name, and recipient_email are required' });
  }

  const settings = await getSettings();
  if (!settings?.docusign_access_token) return res.status(400).json({ error: 'DocuSign not configured' });

  const envelope = {
    templateId: template_id,
    templateRoles: [
      {
        roleName: 'Signer',
        name: recipient_name,
        email: recipient_email,
      },
    ],
    emailSubject: subject || `Please sign: ${template_name || 'Document'}`,
    emailBlurb: message || 'Please review and sign the attached document.',
    status: 'sent',
  };

  try {
    const result = await dsRequest(settings, 'POST', '/envelopes', envelope);
    const envelopeId = result.envelopeId;

    // Save to DB
    const { data: doc, error: dbErr } = await supabase
      .from('legal_documents')
      .insert({
        envelope_id: envelopeId,
        template_id,
        template_name: template_name || null,
        recipient_name,
        recipient_email,
        subject: envelope.emailSubject,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbErr) console.error('[Legal] DB insert error:', dbErr.message);

    res.json({ ok: true, envelopeId, doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/legal/documents/:id/void — void an envelope
router.patch('/documents/:id/void', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  const { id } = req.params;
  const { reason } = req.body;

  const { data: doc } = await supabase.from('legal_documents').select('envelope_id').eq('id', id).single();
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const settings = await getSettings();
  if (!settings?.docusign_access_token) return res.status(400).json({ error: 'DocuSign not configured' });

  try {
    await dsRequest(settings, 'PUT', `/envelopes/${doc.envelope_id}`, {
      status: 'voided',
      voidedReason: reason || 'Voided by legal team',
    });

    await supabase
      .from('legal_documents')
      .update({ status: 'voided', voided_at: new Date().toISOString() })
      .eq('id', id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/legal/documents/:id/remind — resend reminder
router.post('/documents/:id/remind', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  const { id } = req.params;
  const { data: doc } = await supabase.from('legal_documents').select('envelope_id').eq('id', id).single();
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const settings = await getSettings();
  if (!settings?.docusign_access_token) return res.status(400).json({ error: 'DocuSign not configured' });

  try {
    await dsRequest(settings, 'PUT', `/envelopes/${doc.envelope_id}/recipients?resend_envelope=true`, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/legal/documents/:id/status — refresh status from DocuSign
router.get('/documents/:id/status', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  const { id } = req.params;
  const { data: doc } = await supabase.from('legal_documents').select('*').eq('id', id).single();
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const settings = await getSettings();
  if (!settings?.docusign_access_token) return res.status(400).json({ error: 'DocuSign not configured' });

  try {
    const envelope = await dsRequest(settings, 'GET', `/envelopes/${doc.envelope_id}`);
    const updates = { status: envelope.status };
    if (envelope.status === 'completed') updates.completed_at = envelope.completedDateTime;
    await supabase.from('legal_documents').update(updates).eq('id', id);
    res.json({ status: envelope.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/legal/notifications
router.get('/notifications', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  const { data, error } = await supabase
    .from('legal_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/legal/notifications — log a counsel notification (client triggers mailto, we just log it)
router.post('/notifications', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  const { type, message, recipient_email, related_envelope_id } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const { data, error } = await supabase
    .from('legal_notifications')
    .insert({
      type: type || 'alert',
      message,
      recipient_email: recipient_email || null,
      related_envelope_id: related_envelope_id || null,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/legal/notifications/:id/read
router.patch('/notifications/:id/read', async (req, res) => {
  const user = await getUser(req);
  if (!user || !canAccess(user.role)) return res.status(403).json({ error: 'Forbidden' });

  await supabase.from('legal_notifications').update({ is_read: true }).eq('id', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
