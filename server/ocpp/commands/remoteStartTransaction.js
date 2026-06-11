const { sendCommand } = require('./sendCommand');

async function remoteStartTransaction(chargePointId, connectorId, idTag) {
  return sendCommand(chargePointId, 'RemoteStartTransaction', {
    connectorId: connectorId || 1,
    idTag: idTag || 'PRIMECOM',
  });
}

module.exports = remoteStartTransaction;
