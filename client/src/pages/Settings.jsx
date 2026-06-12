import { useState } from 'react';

const SETTING_SECTIONS = [
  {
    title: 'Navigation',
    items: [
      { key: 'nav_rfid_tags', label: 'Show RFID Tags page', description: 'Display the RFID Tags link in the sidebar' },
      { key: 'nav_settings', label: 'Show Settings page', description: 'Display the Settings link in the sidebar (always on)', disabled: true },
    ],
  },
  {
    title: 'Phase 2 Features',
    items: [
      { key: 'feat_config_tab', label: 'Config tab in Charger Detail', description: 'Show the Config tab for reading and changing charger configuration keys' },
      { key: 'feat_firmware_tab', label: 'Firmware tab in Charger Detail', description: 'Show the Firmware tab for pushing OTA updates and viewing firmware history' },
      { key: 'feat_unlock_connector', label: 'Unlock Connector command', description: 'Show the Unlock Connector button in the command panel' },
      { key: 'feat_clear_cache', label: 'Clear Cache command', description: 'Show the Clear Cache button in the command panel' },
    ],
  },
  {
    title: 'Phase 3 Features',
    items: [
      { key: 'feat_csv_export', label: 'CSV Export on Sessions page', description: 'Show the Export CSV button on the Sessions page' },
      { key: 'feat_notes_edit', label: 'Editable Notes and Location', description: 'Allow editing the Notes and Location fields on the Charger Detail overview tab' },
      { key: 'feat_health_score', label: 'Health score on charger cards', description: 'Show a calculated health score percentage on each charger card in the Dashboard' },
      { key: 'feat_status_filter', label: 'Status filter on Dashboard', description: 'Show the status filter buttons above the charger grid on the Dashboard' },
    ],
  },
];

function getSettingValue(key) {
  return localStorage.getItem(`settings_${key}`) !== 'false';
}

function setSettingValue(key, value) {
  localStorage.setItem(`settings_${key}`, value ? 'true' : 'false');
}

export default function Settings() {
  const [, forceRender] = useState(0);

  function toggle(key, disabled) {
    if (disabled) return;
    const current = getSettingValue(key);
    setSettingValue(key, !current);
    // Dispatch storage event so Sidebar updates
    window.dispatchEvent(new Event('storage'));
    forceRender((n) => n + 1);
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Settings</h1>
        <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Feature toggles stored in localStorage</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {SETTING_SECTIONS.map((section) => (
          <div
            key={section.title}
            style={{
              background: '#1a1d27',
              border: '1px solid #2e3347',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {/* Section header */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #2e3347',
                fontSize: 13,
                fontWeight: 600,
                color: '#8892a4',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {section.title}
            </div>

            {/* Settings rows */}
            {section.items.map((item, idx) => {
              const enabled = getSettingValue(item.key);
              return (
                <div
                  key={item.key}
                  onClick={() => toggle(item.key, item.disabled)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderBottom: idx < section.items.length - 1 ? '1px solid #2e3347' : 'none',
                    cursor: item.disabled ? 'default' : 'pointer',
                    opacity: item.disabled ? 0.5 : 1,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#f1f5f9', marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: '#8892a4' }}>{item.description}</div>
                  </div>

                  {/* Toggle switch */}
                  <div
                    style={{
                      flexShrink: 0,
                      marginLeft: 24,
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: enabled ? '#47a141' : '#22263a',
                      border: `1px solid ${enabled ? '#47a141' : '#2e3347'}`,
                      position: 'relative',
                      transition: 'background 0.2s, border-color 0.2s',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: enabled ? 20 : 2,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        background: '#fff',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: '#8892a4' }}>
        Changes take effect immediately. Reload the page if a tab or nav item does not appear after toggling.
      </div>
    </div>
  );
}
