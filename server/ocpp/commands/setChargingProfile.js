const { sendCommand } = require('./sendCommand');

// connectorId 0 = whole charge point (both connectors combined), profile purpose
// must be ChargePointMaxProfile per OCPP 1.6. A specific connector uses
// TxDefaultProfile so the limit persists across transactions until replaced.
// Fixed chargingProfileId per scope so re-sending replaces the prior limit
// instead of stacking a new profile.
async function setChargingProfile(chargePointId, connectorId, limitWatts) {
  const purpose = connectorId === 0 ? 'ChargePointMaxProfile' : 'TxDefaultProfile';
  return sendCommand(chargePointId, 'SetChargingProfile', {
    connectorId,
    csChargingProfiles: {
      chargingProfileId: 9000 + connectorId,
      stackLevel: 0,
      chargingProfilePurpose: purpose,
      chargingProfileKind: 'Absolute',
      chargingSchedule: {
        chargingRateUnit: 'W',
        chargingSchedulePeriod: [{ startPeriod: 0, limit: limitWatts }],
      },
    },
  });
}

module.exports = setChargingProfile;
