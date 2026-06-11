const { sendCommand } = require('./sendCommand');

async function getDiagnostics(chargePointId, location) {
  return sendCommand(chargePointId, 'GetDiagnostics', {
    location,
    retries: 3,
    retryInterval: 60,
  });
}

module.exports = getDiagnostics;
