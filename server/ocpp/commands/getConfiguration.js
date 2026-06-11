const { sendCommand } = require('./sendCommand');

async function getConfiguration(chargePointId, keys) {
  const payload = keys && keys.length > 0 ? { key: keys } : {};
  return sendCommand(chargePointId, 'GetConfiguration', payload);
}

module.exports = getConfiguration;
