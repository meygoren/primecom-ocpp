const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const connections = require('../state/connections');
const { getConnectorLiveDataBatch } = require('../utils/liveData');

async function enrichChargers(chargers) {
  const ids = chargers.map((c) => c.charger_id);
  const liveMap = await getConnectorLiveDataBatch(ids);
  return chargers.map((c) => ({
    ...c,
    connected: connections.has(c.charger_id),
    connectors_live: liveMap[c.charger_id] || [],
  }));
}

async function getUserFromReq(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  return user || null;
}

// GET /api/me
router.get('/', async (req, res) => {
  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  res.json({ id: user.id, email: user.email, profile: profile || { role: 'viewer' } });
});

// GET /api/me/chargers
// Admin / Operator / Viewer → all chargers
// Driver → only assigned chargers
router.get('/chargers', async (req, res) => {
  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = profile?.role;

  if (['admin', 'operator', 'viewer'].includes(role)) {
    const { data } = await supabase.from('chargers').select('*').order('charger_id');
    return res.json(await enrichChargers(data || []));
  }

  // Driver: assigned chargers only
  const { data: assignments } = await supabase
    .from('charger_assignments').select('charger_id').eq('user_id', user.id);
  const ids = (assignments || []).map((a) => a.charger_id);
  if (!ids.length) return res.json([]);
  const { data: chargers } = await supabase.from('chargers').select('*').in('charger_id', ids);
  res.json(await enrichChargers(chargers || []));
});

// GET /api/me/driver
// Returns everything a driver needs in one call: charger, active session, SOC, power, notifications, prefs
router.get('/driver', async (req, res) => {
  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: assignments } = await supabase
    .from('charger_assignments').select('charger_id').eq('user_id', user.id).limit(1);

  if (!assignments?.length) {
    return res.json({ charger: null, session: null, soc: null, power: null, notifications: [], preferences: { soc_threshold: 90 } });
  }

  const chargerId = assignments[0].charger_id;
  const { data: charger } = await supabase.from('chargers').select('*').eq('charger_id', chargerId).single();

  // Active session (no stop_time)
  const { data: sessions } = await supabase
    .from('sessions').select('*')
    .eq('charger_id', chargerId).is('stop_time', null)
    .order('start_time', { ascending: false }).limit(1);
  const activeSession = sessions?.[0] || null;

  let soc = null;
  let power = null;

  if (activeSession) {
    const [socRes, powerRes] = await Promise.all([
      supabase.from('meter_values').select('value').eq('charger_id', chargerId)
        .eq('transaction_id', activeSession.transaction_id).eq('measurand', 'SoC')
        .order('timestamp', { ascending: false }).limit(1),
      supabase.from('meter_values').select('value, unit').eq('charger_id', chargerId)
        .eq('transaction_id', activeSession.transaction_id).eq('measurand', 'Power.Active.Import')
        .order('timestamp', { ascending: false }).limit(1),
    ]);
    soc = socRes.data?.[0]?.value ?? null;
    power = powerRes.data?.[0] || null;
  }

  const [notifRes, prefRes] = await Promise.all([
    supabase.from('notifications').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('driver_preferences').select('*').eq('user_id', user.id).single(),
  ]);

  res.json({
    charger,
    session: activeSession,
    soc,
    power,
    notifications: notifRes.data || [],
    preferences: prefRes.data || { soc_threshold: 90, notify_complete: true, notify_fault: true },
  });
});

module.exports = router;
