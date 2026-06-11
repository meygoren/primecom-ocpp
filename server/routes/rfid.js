const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// GET /api/rfid — list all authorized RFID tags
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('rfid_tags')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// POST /api/rfid — add a new RFID tag
router.post('/', async (req, res) => {
  const { tag, label } = req.body;

  if (!tag || !tag.trim()) {
    return res.status(400).json({ error: 'tag is required' });
  }

  const { data, error } = await supabase
    .from('rfid_tags')
    .insert({ tag: tag.trim(), label: label || null })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: `Tag "${tag.trim()}" already exists` });
    }
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// DELETE /api/rfid/:tag — remove an RFID tag
router.delete('/:tag', async (req, res) => {
  const { tag } = req.params;

  const { error, count } = await supabase
    .from('rfid_tags')
    .delete({ count: 'exact' })
    .eq('tag', tag);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (count === 0) {
    return res.status(404).json({ error: `Tag "${tag}" not found` });
  }

  res.json({ success: true });
});

module.exports = router;
