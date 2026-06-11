const { sendCommand } = require('./sendCommand');

async function changeConfiguration(chargePointId, key, value) {
  return sendCommand(chargePointId, 'ChangeConfiguration', { key, value });
}

module.exports = changeConfiguration;
