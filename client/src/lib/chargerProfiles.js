// Mirrors server/ocpp/chargerProfiles.js — keys must match exactly.
// Drives which command inputs the UI shows for a given charger, since not
// every vendor's firmware supports the same proprietary config keys.
export const CHARGER_PROFILES = [
  { key: 'primecom_default', label: 'Primecom (default)', hasCurrentLimitKey: true },
  { key: 'smart_charging_only', label: 'Smart Charging only (no current-limit key)', hasCurrentLimitKey: false },
];

export function getChargerProfile(chargerType) {
  return CHARGER_PROFILES.find((p) => p.key === chargerType) || CHARGER_PROFILES[0];
}
