const { sendCommand } = require('./sendCommand');

async function remoteStopTransaction(chargePointId, transactionId) {
  return sendCommand(chargePointId, 'RemoteStopTransaction', { transactionId });
}

module.exports = remoteStopTransaction;
