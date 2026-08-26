const supabase = require('../../db/supabase');

// Normalises an RFID tag for comparison. Readers and firmwares differ on
// case and on separators, so "04:A3:BF:12", "04a3bf12" and " 04A3BF12 " all
// have to be treated as the same tag — otherwise a tag the team believes is
// authorised gets rejected and the charger stops the session seconds after
// it starts.
function normalizeTag(tag) {
  return String(tag || '')
    .trim()
    .toUpperCase()
    .replace(/[\s:-]/g, '');
}

// If rfid_tags table has any rows, only accept listed tags.
// If the table is empty, accept all (Phase 1 behavior).
async function handleAuthorize(chargePointId, payload) {
  const { idTag } = payload;

  try {
    // Pull the whole list — it is small, and comparing in JS lets us match
    // tags that differ only by case or separators.
    const { data: tags, error } = await supabase.from('rfid_tags').select('tag');

    if (error) {
      console.error('[Authorize] DB error:', error.message);
      // Fail open — accept the tag so a DB error does not block charging
      return { idTagInfo: { status: 'Accepted' } };
    }

    // If no tags configured, accept all (Phase 1 open mode)
    if (!tags || tags.length === 0) {
      console.log(`[Authorize] ${chargePointId} tag "${idTag}" accepted (open mode — no tags configured)`);
      return { idTagInfo: { status: 'Accepted' } };
    }

    const wanted = normalizeTag(idTag);
    const match = tags.find((t) => normalizeTag(t.tag) === wanted);

    if (match) {
      console.log(`[Authorize] ${chargePointId} tag "${idTag}" accepted`);
      return { idTagInfo: { status: 'Accepted' } };
    }

    console.warn(
      `[Authorize] ${chargePointId} tag "${idTag}" REJECTED — not in the ${tags.length} configured RFID tags. ` +
        'The charger will refuse to charge, or stop the session within seconds. ' +
        'Add this tag on the RFID page, or clear the RFID list to run in open mode.'
    );
    return { idTagInfo: { status: 'Invalid' } };
  } catch (err) {
    console.error('[Authorize] Unexpected error:', err.message);
    return { idTagInfo: { status: 'Accepted' } };
  }
}

module.exports = handleAuthorize;
