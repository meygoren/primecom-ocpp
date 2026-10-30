const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const requireRole = require('../middleware/requireRole');
const { normalizeMac, clearBatterySystemsCache } = require('../services/sessionStats');

// Battery systems the chargers feed (Primecom ~450 kWh, SETEC ~240 kWh).
// Capacity and MAC addresses drive automatic detection on each session.

// GET /api/battery-systems
router.get('/', requireRole('admin', 'operator', 'viewer'), async (_req, res) => {
  const { data, error } = await supabase.from('battery_systems').select('*').order('sort_order');
  if (error) {
    return res.status(500).json({
      error: `${error.message} — run supabase_migration_locations.sql in the Supabase SQL editor`,
    });
  }
  res.json(data);
});

// PATCH /api/battery-systems/:id — body: { label?, capacity_kwh?, mac_addresses? }
router.patch('/:id', requireRole('admin'), async (req, res) => {
  const { label, capacity_kwh, mac_addresses } = req.body;
  const updates = {};

  if (label !== undefined) updates.label = String(label).trim();
  if (capacity_kwh !== undefined) {
    const cap = parseFloat(capacity_kwh);
    if (!Number.isFinite(cap) || cap <= 0) return res.status(400).json({ error: 'Capacity must be a positive number of kWh' });
    updates.capacity_kwh = cap;
  }
  if (mac_addresses !== undefined) {
    if (!Array.isArray(mac_addresses)) return res.status(400).json({ error: 'mac_addresses must be an array' });
    // Stored normalised (uppercase, no separators) so matching is exact.
    updates.mac_addresses = [...new Set(mac_addresses.map(normalizeMac).filter(Boolean))];
  }

  const { data, error } = await supabase
    .from('battery_systems')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  clearBatterySystemsCache();
  res.json(data);
});

module.exports = router;
