const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// ─── Settings helpers ──────────────────────────────────────────────────────────

async function getSettings() {
  const { data } = await supabase
    .from('billing_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  return data || {
    kwh_rate:          0.50,
    daily_showup_fee:  150.00,
    showup_fee_enabled: true,
    report_emails:     [],
    weekly_report_enabled: true,
  };
}

// ─── Revenue aggregation ───────────────────────────────────────────────────────

// Bucket sessions into daily rows.  Returns:
//  [{ date: 'YYYY-MM-DD', kwh: number, sessions: number, service_day: bool }, ...]
async function fetchDailyKwh(from, to) {
  const { data, error } = await supabase
    .from('sessions')
    .select('start_time, stop_time, energy_kwh')
    .gte('start_time', from)
    .lt('start_time', to)
    .not('energy_kwh', 'is', null)
    .order('start_time', { ascending: true });

  if (error) throw error;

  const map = {};
  for (const row of data || []) {
    const date = row.start_time.slice(0, 10);
    if (!map[date]) map[date] = { date, kwh: 0, sessions: 0 };
    map[date].kwh      += parseFloat(row.energy_kwh) || 0;
    map[date].sessions += 1;
  }

  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function calcRevenue(days, settings) {
  return days.map((d) => {
    const energy_rev  = d.kwh * (settings.kwh_rate || 0);
    const showup_rev  = settings.showup_fee_enabled ? (settings.daily_showup_fee || 0) : 0;
    const total_rev   = energy_rev + showup_rev;
    return { ...d, energy_rev, showup_rev, total_rev };
  });
}

// Build a bucketed summary for a given window.
// periodSize: 'day' | 'week' | 'month'
function rollup(rows, periodSize) {
  if (periodSize === 'day') return rows;

  const groups = {};
  for (const r of rows) {
    let key;
    const d = new Date(r.date + 'T00:00:00Z');
    if (periodSize === 'week') {
      // ISO week Monday as key
      const day = d.getUTCDay();
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
      key = monday.toISOString().slice(0, 10);
    } else {
      key = r.date.slice(0, 7); // YYYY-MM
    }
    if (!groups[key]) groups[key] = { date: key, kwh: 0, sessions: 0, energy_rev: 0, showup_rev: 0, total_rev: 0 };
    groups[key].kwh        += r.kwh;
    groups[key].sessions   += r.sessions;
    groups[key].energy_rev += r.energy_rev;
    groups[key].showup_rev += r.showup_rev;
    groups[key].total_rev  += r.total_rev;
  }
  return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── GET /api/billing/summary?period=daily|weekly|monthly|yearly ───────────────

router.get('/summary', async (req, res) => {
  try {
    const period = req.query.period || 'daily';
    const settings = await getSettings();
    const now = new Date();

    // Determine date window + previous window
    let from, to, prevFrom, prevTo, bucketSize;
    if (period === 'daily') {
      // Last 30 days
      to   = now.toISOString().slice(0, 10);
      from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      prevFrom = new Date(Date.now() - 59 * 86400000).toISOString().slice(0, 10);
      prevTo   = from;
      bucketSize = 'day';
    } else if (period === 'weekly') {
      // Last 12 weeks
      to   = now.toISOString().slice(0, 10);
      from = new Date(Date.now() - 83 * 86400000).toISOString().slice(0, 10);
      prevFrom = new Date(Date.now() - 167 * 86400000).toISOString().slice(0, 10);
      prevTo   = from;
      bucketSize = 'week';
    } else if (period === 'monthly') {
      // Last 12 months
      const yr = now.getUTCFullYear();
      const mo = now.getUTCMonth();
      to   = `${yr}-${String(mo + 1).padStart(2, '0')}-01`;
      const fromDate = new Date(Date.UTC(yr, mo - 11, 1));
      from = fromDate.toISOString().slice(0, 10);
      const prevFromDate = new Date(Date.UTC(yr, mo - 23, 1));
      prevFrom = prevFromDate.toISOString().slice(0, 10);
      prevTo   = from;
      bucketSize = 'month';
    } else {
      // yearly: last 3 years
      const yr = now.getUTCFullYear();
      from     = `${yr - 2}-01-01`;
      to       = `${yr + 1}-01-01`;
      prevFrom = `${yr - 5}-01-01`;
      prevTo   = from;
      bucketSize = 'month'; // still bucket by month, front-end can re-roll
    }

    const [currDays, prevDays] = await Promise.all([
      fetchDailyKwh(from, to),
      fetchDailyKwh(prevFrom, prevTo),
    ]);

    const currRows = rollup(calcRevenue(currDays, settings), bucketSize);
    const prevRows = rollup(calcRevenue(prevDays, settings), bucketSize);

    const totals = (rows) => rows.reduce(
      (acc, r) => ({
        kwh:        acc.kwh + r.kwh,
        sessions:   acc.sessions + r.sessions,
        energy_rev: acc.energy_rev + r.energy_rev,
        showup_rev: acc.showup_rev + r.showup_rev,
        total_rev:  acc.total_rev + r.total_rev,
      }),
      { kwh: 0, sessions: 0, energy_rev: 0, showup_rev: 0, total_rev: 0 }
    );

    res.json({
      period,
      settings,
      current: { rows: currRows, totals: totals(currRows) },
      previous: { rows: prevRows, totals: totals(prevRows) },
    });
  } catch (err) {
    console.error('[Billing] Summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/billing/settings ────────────────────────────────────────────────

router.get('/settings', async (req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/billing/settings ─────────────────────────────────────────────

router.patch('/settings', async (req, res) => {
  try {
    const allowed = ['kwh_rate', 'daily_showup_fee', 'showup_fee_enabled', 'report_emails', 'weekly_report_enabled'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const existing = await getSettings();
    if (existing.id) {
      const { data, error } = await supabase
        .from('billing_settings')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return res.json(data);
    } else {
      const { data, error } = await supabase
        .from('billing_settings')
        .insert(updates)
        .select()
        .single();
      if (error) throw error;
      return res.json(data);
    }
  } catch (err) {
    console.error('[Billing] Settings save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/billing/send-report ────────────────────────────────────────────
// Manual trigger; also called by the weekly cron.

async function buildWeeklyReport() {
  const settings = await getSettings();
  const to   = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const days    = calcRevenue(await fetchDailyKwh(from, to), settings);
  const totals  = days.reduce(
    (acc, r) => ({ kwh: acc.kwh + r.kwh, sessions: acc.sessions + r.sessions, total_rev: acc.total_rev + r.total_rev }),
    { kwh: 0, sessions: 0, total_rev: 0 }
  );
  return { settings, days, totals, from, to };
}

function reportText({ settings, days, totals, from, to }) {
  const fmt = (n) => `$${n.toFixed(2)}`;
  const kwhFmt = (n) => `${n.toFixed(1)} kWh`;
  const lines = [
    `Primecom Technologies — Weekly Billing Report`,
    `Period: ${from} to ${to}`,
    ``,
    `Summary`,
    `  Total energy dispensed : ${kwhFmt(totals.kwh)}`,
    `  Total sessions         : ${totals.sessions}`,
    `  Rate                   : ${fmt(settings.kwh_rate)} / kWh`,
    settings.showup_fee_enabled
      ? `  Daily show-up fee      : ${fmt(settings.daily_showup_fee)} / day`
      : `  Daily show-up fee      : disabled`,
    `  ─────────────────────────────────`,
    `  Gross revenue          : ${fmt(totals.total_rev)}`,
    ``,
    `Daily Breakdown`,
  ];
  for (const d of days) {
    lines.push(`  ${d.date}  ${kwhFmt(d.kwh).padEnd(12)} ${fmt(d.total_rev)}`);
  }
  lines.push('');
  lines.push('Generated automatically by Primecom OCPP Central System.');
  return lines.join('\n');
}

router.post('/send-report', async (req, res) => {
  try {
    const report = await buildWeeklyReport();
    const emails = report.settings.report_emails || [];
    if (!emails.length) return res.status(400).json({ error: 'No report emails configured in billing settings.' });

    const { sendEmail } = require('../services/alertService');
    const subject = `Primecom Weekly Billing Report — ${report.from} to ${report.to}`;
    const text = reportText(report);

    for (const email of emails) {
      await sendEmail(email, subject, text);
    }
    res.json({ sent: emails, from: report.from, to: report.to, total_rev: report.totals.total_rev });
  } catch (err) {
    console.error('[Billing] Send report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Weekly cron ───────────────────────────────────────────────────────────────
// Call startWeeklyCron() once from index.js.

function startWeeklyCron() {
  function scheduleNext() {
    const now = new Date();
    // Fire every Monday 06:00 UTC
    const next = new Date(now);
    next.setUTCHours(6, 0, 0, 0);
    // Advance to next Monday
    const daysUntilMonday = (8 - next.getUTCDay()) % 7 || 7;
    next.setUTCDate(next.getUTCDate() + daysUntilMonday);

    const msUntil = next.getTime() - Date.now();
    console.log(`[Billing] Weekly report scheduled for ${next.toISOString()} (in ${Math.round(msUntil / 3600000)} h)`);

    setTimeout(async () => {
      try {
        const settings = await getSettings();
        if (!settings.weekly_report_enabled) { scheduleNext(); return; }
        const emails = settings.report_emails || [];
        if (!emails.length) { scheduleNext(); return; }

        const report = await buildWeeklyReport();
        const { sendEmail } = require('../services/alertService');
        const subject = `Primecom Weekly Billing Report — ${report.from} to ${report.to}`;
        const text = reportText(report);
        for (const email of emails) await sendEmail(email, subject, text);
        console.log(`[Billing] Weekly report sent to: ${emails.join(', ')}`);
      } catch (err) {
        console.error('[Billing] Weekly cron error:', err.message);
      }
      scheduleNext();
    }, msUntil);
  }

  scheduleNext();
}

module.exports = router;
module.exports.startWeeklyCron = startWeeklyCron;
