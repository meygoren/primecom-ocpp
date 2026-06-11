import { createContext, useContext, useState, useCallback } from 'react';

const DEFAULTS = {
  nav_sessions: true,
  nav_logs: true,
  nav_rfid: true,
  feat_status_filter: true,
  feat_health_score: true,
  feat_csv_export: true,
  feat_unlock_connector: true,
  feat_clear_cache: true,
};

function load() {
  const out = {};
  for (const [k, def] of Object.entries(DEFAULTS)) {
    const stored = localStorage.getItem(`settings_${k}`);
    out[k] = stored === null ? def : stored !== 'false';
  }
  return out;
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  const setSetting = useCallback((key, value) => {
    localStorage.setItem(`settings_${key}`, value ? 'true' : 'false');
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, setSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
