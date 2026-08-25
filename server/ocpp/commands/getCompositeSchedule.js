const { sendCommand } = require('./sendCommand');

// Reads back the charger's currently effective charging limit for a scope
// (connectorId 0 = whole charge point) — the read-side counterpart to
// SetChargingProfile. chargingRateUnit is optional; when given, the charger
// is asked to respond in that unit ('W' or 'A').
async function getCompositeSchedule(chargePointId, connectorId, duration, chargingRateUnit) {
  const payload = { connectorId, duration: duration || 60 };
  if (chargingRateUnit) payload.chargingRateUnit = chargingRateUnit;
  return sendCommand(chargePointId, 'GetCompositeSchedule', payload);
}

module.exports = getCompositeSchedule;
