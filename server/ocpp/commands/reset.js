const { sendCommand } = require('./sendCommand');

async function reset(chargePointId, type = 'Soft') {
  return sendCommand(chargePointId, 'Reset', { type });
}

module.exports = reset;
