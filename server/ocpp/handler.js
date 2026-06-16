const supabase = require('../db/supabase');
const handleBootNotification = require('./messages/bootNotification');
const handleHeartbeat = require('./messages/heartbeat');
const handleStatusNotification = require('./messages/statusNotification');
const handleStartTransaction = require('./messages/startTransaction');
const handleStopTransaction = require('./messages/stopTransaction');
const handleMeterValues = require('./messages/meterValues');
const handleAuthorize = require('./messages/authorize');
const handleFirmwareStatusNotification = require('./messages/firmwareStatusNotification');
const handleDataTransfer = require('./messages/dataTransfer');

const MESSAGE_TYPE_CALL = 2;
const MESSAGE_TYPE_CALLRESULT = 3;
const MESSAGE_TYPE_CALLERROR = 4;

// Logs every OCPP message to the ocpp_logs table
async function logMessage(chargePointId, direction, messageTypeId, action, messageId, payload) {
  try {
    await supabase.from('ocpp_logs').insert({
      charger_id: chargePointId,
      direction,
      message_type: messageTypeId,
      action: action || null,
      message_id: messageId,
      payload: payload || {},
    });
  } catch (err) {
    console.error(`[Logger] Failed to write log for ${chargePointId}:`, err.message);
  }
}

async function handleMessage(chargePointId, rawMessage, ws, pendingCalls) {
  let parsed;
  try {
    parsed = JSON.parse(rawMessage);
  } catch (err) {
    console.error(`[Handler] Invalid JSON from ${chargePointId}:`, rawMessage);
    return;
  }

  const [messageTypeId, messageId, ...rest] = parsed;

  if (messageTypeId === MESSAGE_TYPE_CALLRESULT) {
    // Response to a command we sent
    const payload = rest[0];
    await logMessage(chargePointId, 'incoming', messageTypeId, null, messageId, payload);

    const pending = pendingCalls.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingCalls.delete(messageId);
      pending.resolve(payload);
    }
    return;
  }

  if (messageTypeId === MESSAGE_TYPE_CALLERROR) {
    const [errorCode, errorDescription, errorDetails] = rest;
    await logMessage(chargePointId, 'incoming', messageTypeId, null, messageId, {
      errorCode,
      errorDescription,
      errorDetails,
    });

    const pending = pendingCalls.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingCalls.delete(messageId);
      pending.reject(new Error(`${errorCode}: ${errorDescription}`));
    }
    return;
  }

  if (messageTypeId !== MESSAGE_TYPE_CALL) {
    console.warn(`[Handler] Unknown message type ${messageTypeId} from ${chargePointId}`);
    return;
  }

  const [action, payload] = rest;
  await logMessage(chargePointId, 'incoming', messageTypeId, action, messageId, payload);

  let response;
  try {
    switch (action) {
      case 'BootNotification':
        response = await handleBootNotification(chargePointId, payload);
        break;
      case 'Heartbeat':
        response = await handleHeartbeat(chargePointId);
        break;
      case 'StatusNotification':
        response = await handleStatusNotification(chargePointId, payload);
        break;
      case 'StartTransaction':
        response = await handleStartTransaction(chargePointId, payload);
        break;
      case 'StopTransaction':
        response = await handleStopTransaction(chargePointId, payload);
        break;
      case 'MeterValues':
        response = await handleMeterValues(chargePointId, payload);
        break;
      case 'Authorize':
        response = await handleAuthorize(chargePointId, payload);
        break;
      case 'FirmwareStatusNotification':
        response = await handleFirmwareStatusNotification(chargePointId, payload);
        break;
      case 'DiagnosticsStatusNotification':
        // Log it, nothing more in Phase 1
        console.log(`[DiagnosticsStatus] ${chargePointId}: ${payload.status}`);
        response = {};
        break;
      case 'DataTransfer':
        response = await handleDataTransfer(chargePointId, payload);
        break;
      default:
        console.warn(`[Handler] Unhandled action '${action}' from ${chargePointId}`);
        response = {};
    }
  } catch (err) {
    console.error(`[Handler] Error processing '${action}' from ${chargePointId}:`, err.message);
    const errorReply = JSON.stringify([MESSAGE_TYPE_CALLERROR, messageId, 'InternalError', err.message, {}]);
    ws.send(errorReply);
    return;
  }

  const reply = JSON.stringify([MESSAGE_TYPE_CALLRESULT, messageId, response]);
  await logMessage(chargePointId, 'outgoing', MESSAGE_TYPE_CALLRESULT, action, messageId, response);
  ws.send(reply);
}

module.exports = { handleMessage };
