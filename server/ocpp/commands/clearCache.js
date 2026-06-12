const { sendCommand } = require('./sendCommand');

async function clearCache(chargePointId) {
  return sendCommand(chargePointId, 'ClearCache', {});
}

module.exports = clearCache;
