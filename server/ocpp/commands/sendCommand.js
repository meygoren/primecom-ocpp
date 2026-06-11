const { randomUUID } = require('crypto');
const connections = require('../../state/connections');
const supabase = require('../../db/supabase');

const COMMAND_TIMEOUT_MS = 30000;

// pendingCalls is shared from index.js — imported here so commands can reuse it
// We expose it so the WebSocket message handler can resolve/reject pending calls
const pendingCalls = new Map();

async function sendCommand(chargePointId, action, payload) {
  const ws = connections.get(chargePointId);
  if (!ws || ws.readyState !== 1 /* WebSocket.OPEN */) {
    throw new Error(`Charger ${chargePointId} is not connected`);
  }

  const messageId = randomUUID();
  const message = JSON.stringify([2, messageId, action, payload]);

  // Log outgoing command
  try {
    await supabase.from('ocpp_logs').insert({
      charger_id: chargePointId,
      direction: 'outgoing',
      message_type: 2,
      action,
      message_id: messageId,
      payload,
    });
  } catch (err) {
    console.error(`[sendCommand] Log error for ${chargePointId}:`, err.message);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCalls.delete(messageId);
      reject(new Error(`Command '${action}' to ${chargePointId} timed out after 30s`));
    }, COMMAND_TIMEOUT_MS);

    pendingCalls.set(messageId, { resolve, reject, timeout });
    ws.send(message);
  });
}

module.exports = { sendCommand, pendingCalls };
