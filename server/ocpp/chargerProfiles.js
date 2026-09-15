// Different charger vendors expose different (or no) proprietary
// ChangeConfiguration keys for capping max current — the key that works on
// one vendor's firmware can be silently unsupported on another's. A
// charger's `charger_type` (set manually per unit, since BootNotification
// vendor/model strings aren't reliable enough to key off of) selects which
// mechanism this server actually uses when sending that command.
const CHARGER_PROFILES = {
  primecom_default: {
    label: 'Primecom (default)',
    currentLimitConfigKey: 'ChargePointMaxCurrentLimit',
  },
  smart_charging_only: {
    label: 'Smart Charging only (no current-limit config key)',
    currentLimitConfigKey: null,
  },
};

const DEFAULT_CHARGER_TYPE = 'primecom_default';

function getChargerProfile(chargerType) {
  return CHARGER_PROFILES[chargerType] || CHARGER_PROFILES[DEFAULT_CHARGER_TYPE];
}

module.exports = { CHARGER_PROFILES, DEFAULT_CHARGER_TYPE, getChargerProfile };
