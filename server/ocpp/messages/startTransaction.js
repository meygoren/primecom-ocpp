const supabase = require('../../db/supabase');

// Module-level counter seeded from current time. Incrementing ensures uniqueness
// even when two connectors start within the same second on the same server.
let _txCounter = Math.floor(Date.now() / 1000);
function generateTransactionId() {
  return ++_txCounter;
}

async function handleStartTransaction(chargePointId, payload) {
  const { connectorId, idTag, meterStart, timestamp } = payload;
  const transactionId = generateTransactionId();
  const startTime = timestamp || new Date().toISOString();

  const { error } = await supabase.from('sessions').insert({
    charger_id: chargePointId,
    transaction_id: transactionId,
    connector_id: connectorId,
    id_tag: idTag,
    start_time: startTime,
  });

  if (error) {
    console.error(`[StartTransaction] DB error for ${chargePointId}:`, error.message);
  }

  // Update charger status to charging
  await supabase
    .from('chargers')
    .update({ status: 'charging', last_seen: new Date().toISOString() })
    .eq('charger_id', chargePointId);

  return {
    transactionId,
    idTagInfo: { status: 'Accepted' },
  };
}

module.exports = handleStartTransaction;
