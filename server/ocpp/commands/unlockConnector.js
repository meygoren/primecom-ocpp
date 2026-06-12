const { sendCommand } = require('./sendCommand');

async function unlockConnector(chargePointId, connectorId = 1) {
  return sendCommand(chargePointId, 'UnlockConnector', { connectorId: parseInt(connectorId, 10) });
}

module.exports = unlockConnector;
