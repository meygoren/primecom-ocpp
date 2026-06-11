const supabase = require('../../db/supabase');

// If rfid_tags table has any rows, only accept listed tags.
// If the table is empty, accept all (Phase 1 behavior).
async function handleAuthorize(chargePointId, payload) {
  const { idTag } = payload;

  try {
    // First, count how many tags are in the table
    const { count, error: countError } = await supabase
      .from('rfid_tags')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('[Authorize] DB count error:', countError.message);
      // Fail open — accept the tag so a DB error does not block charging
      return { idTagInfo: { status: 'Accepted' } };
    }

    // If no tags configured, accept all (Phase 1 open mode)
    if (count === 0) {
      return { idTagInfo: { status: 'Accepted' } };
    }

    // Tags exist — check if this tag is in the list
    const { data, error: lookupError } = await supabase
      .from('rfid_tags')
      .select('tag')
      .eq('tag', idTag)
      .maybeSingle();

    if (lookupError) {
      console.error('[Authorize] DB lookup error:', lookupError.message);
      // Fail open on DB errors
      return { idTagInfo: { status: 'Accepted' } };
    }

    if (data) {
      return { idTagInfo: { status: 'Accepted' } };
    }

    console.log(`[Authorize] Tag "${idTag}" rejected — not in rfid_tags list`);
    return { idTagInfo: { status: 'Invalid' } };
  } catch (err) {
    console.error('[Authorize] Unexpected error:', err.message);
    return { idTagInfo: { status: 'Accepted' } };
  }
}

module.exports = handleAuthorize;
