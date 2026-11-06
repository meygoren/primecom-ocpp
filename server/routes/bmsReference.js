const express = require('express');
const supabase = require('../db/supabase');
const requireRole = require('../middleware/requireRole');
const { isOwner } = require('../utils/owner');

// Battery reference data — visible to the platform owner only (see utils/owner.js).
//
// Holds the list of information requested from the battery manufacturer /
// integrator (what was asked, what came back) and the documents they send
// (datasheets, SOP and OCV tables, fault-code lists). Everything is kept in a
// private Supabase Storage bucket, so no database table is needed:
//   _checklist.json   the request list and notes
//   files/<time>-<name>  uploaded documents
//
// Anyone else gets 404, so the area does not reveal that it exists.

const router = express.Router();
const BUCKET = 'bms-reference';
const CHECKLIST = '_checklist.json';
const signedIn = requireRole('admin', 'operator', 'viewer');

function ownerOnly(req, res, next) {
  signedIn(req, res, () => {
    if (!isOwner(req.user)) return res.status(404).json({ error: 'Not found' });
    next();
  });
}

const DEFAULT_CHECKLIST = {
  request_doc_url: 'https://claude.ai/artifact/AgCtXtVp5zZt7NZZhxyPFF',
  known: 'Air cooled. One fan on the front of each pack, blowing outward. Perforated mesh on both sides and the rear of each pack.\nCells: Gotion 330 Ah LFP. 3 strings in parallel × 3 modules in series, 48 cells and 16 temperature sensors per module.\nPower distribution box on top of each pack, at the back of the truck; the charger sits right behind it.',
  items: [
    // Sent in the first, short request.
    ['sop', 'priority', 'SOP tables', 'Allowed charge and discharge current (or power) vs temperature and SOC, continuous and peak'],
    ['ocv', 'priority', 'OCV–SOC curves', 'At several temperatures, charge and discharge'],
    ['alarms', 'priority', 'Alarm and protection thresholds', 'Every level, with recovery values and the action taken'],
    ['faults', 'priority', 'Fault-code list', 'Code, meaning, severity, action'],
    ['columns', 'priority', 'Log column definitions', 'Units, scaling, sign of current, "no data" values'],
    ['dbc', 'priority', 'CAN DBC file for the BMS', ''],
    ['soc_soh', 'priority', 'How SOC and SOH are calculated', 'And when they recalibrate'],
    ['positions', 'priority', 'Cell and sensor positions inside each module', 'Where B1–B432 and T1–T144 physically sit'],
    // Not asked yet — for a later round.
    ['datasheet', 'later', 'Full cell datasheet', 'C-rate vs temperature, resistance (DCIR), cycle life, calendar ageing'],
    ['balancing', 'later', 'Balancing', 'Passive or active, balancing current, when it runs'],
    ['fan', 'later', 'Fan control', 'Temperatures at which the fan turns on and off, fan speed steps'],
    ['charging', 'later', 'Charge profile and charge restarts', 'CC/CV setpoints, end-of-charge rule, why a charge stops and restarts'],
    ['load_share', 'later', 'Load sharing between driver and passenger packs', 'Is an imbalance between the two sides expected?'],
    ['contactors', 'later', 'Contactor and precharge sequence', ''],
    ['api', 'later', 'Automatic log export / platform API', 'So logs arrive without manual downloads'],
    ['firmware', 'later', 'BMS firmware release notes', ''],
    ['warranty', 'later', 'Warranty terms', 'Years, cycles or MWh, guaranteed SOH, conditions'],
  ].map(([id, group, title, detail]) => ({ id, group, title, detail, status: group === 'priority' ? 'asked' : 'not_asked', note: '' })),
};

async function ensureBucket() {
  const { error } = await supabase.storage.getBucket(BUCKET);
  if (!error) return;
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (createErr && !/already exists/i.test(createErr.message)) throw new Error(createErr.message);
}

async function loadChecklist() {
  const { data, error } = await supabase.storage.from(BUCKET).download(CHECKLIST);
  if (error || !data) return JSON.parse(JSON.stringify(DEFAULT_CHECKLIST));
  try {
    return JSON.parse(Buffer.from(await data.arrayBuffer()).toString('utf8'));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CHECKLIST));
  }
}

async function saveChecklist(c) {
  const body = Buffer.from(JSON.stringify(c, null, 2));
  const { error } = await supabase.storage.from(BUCKET).upload(CHECKLIST, body, { contentType: 'application/json', upsert: true });
  if (error) throw new Error(error.message);
}

async function listFiles() {
  const { data, error } = await supabase.storage.from(BUCKET).list('files', { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw new Error(error.message);
  return (data || []).filter((f) => f.name && f.id).map((f) => ({
    path: `files/${f.name}`,
    name: f.name.replace(/^\d+-/, ''),
    size: f.metadata?.size ?? null,
    uploaded_at: f.created_at,
  }));
}

// GET /api/bms-reference — the request list, notes and documents.
router.get('/', ownerOnly, async (_req, res) => {
  try {
    await ensureBucket();
    const [checklist, files] = await Promise.all([loadChecklist(), listFiles()]);
    res.json({ ...checklist, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bms-reference — body: { items, known, request_doc_url }
router.put('/', ownerOnly, async (req, res) => {
  try {
    await ensureBucket();
    const cur = await loadChecklist();
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items.slice(0, 200).map((x) => ({
      id: String(x.id || Math.random().toString(36).slice(2, 9)).slice(0, 40),
      group: x.group === 'priority' ? 'priority' : 'later',
      title: String(x.title || '').slice(0, 200),
      detail: String(x.detail || '').slice(0, 500),
      status: ['not_asked', 'asked', 'received'].includes(x.status) ? x.status : 'not_asked',
      note: String(x.note || '').slice(0, 2000),
    })).filter((x) => x.title) : cur.items;
    const next = {
      request_doc_url: b.request_doc_url !== undefined ? String(b.request_doc_url || '').slice(0, 500) : cur.request_doc_url,
      known: b.known !== undefined ? String(b.known || '').slice(0, 5000) : cur.known,
      items,
    };
    await saveChecklist(next);
    res.json(next);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bms-reference/files?name=<file name> — raw file body.
router.post('/files', ownerOnly, express.raw({ type: () => true, limit: '50mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No file received' });
  const name = String(req.query.name || 'document').replace(/[^\w.\- ()]+/g, '_').slice(0, 150);
  try {
    await ensureBucket();
    const path = `files/${Date.now()}-${name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, req.body, { contentType: req.get('content-type') || 'application/octet-stream' });
    if (error) throw new Error(error.message);
    console.log(`[BMS reference] Uploaded ${name} (${req.body.length} bytes)`);
    res.json({ path, name, size: req.body.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bms-reference/file?path=files/... — download one document.
router.get('/file', ownerOnly, async (req, res) => {
  const path = String(req.query.path || '');
  if (!path.startsWith('files/') || path.includes('..')) return res.status(400).json({ error: 'Bad path' });
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return res.status(404).json({ error: 'File not found' });
  const name = path.replace(/^files\/\d+-/, '');
  res.setHeader('Content-Type', data.type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
  res.send(Buffer.from(await data.arrayBuffer()));
});

// DELETE /api/bms-reference/file?path=files/...
router.delete('/file', ownerOnly, async (req, res) => {
  const path = String(req.query.path || '');
  if (!path.startsWith('files/') || path.includes('..')) return res.status(400).json({ error: 'Bad path' });
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
