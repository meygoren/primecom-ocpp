export default function StatusBadge({ status }) {
  const styles = {
    online: { bg: '#2d5c2a', color: '#47a141', label: 'Online' },
    charging: { bg: '#1e3a5f', color: '#3b82f6', label: 'Charging' },
    faulted: { bg: '#3f1515', color: '#ef4444', label: 'Faulted' },
    offline: { bg: '#1f2937', color: '#6b7280', label: 'Offline' },
    preparing: { bg: '#3f2a00', color: '#f59e0b', label: 'Preparing' },
    finishing: { bg: '#3f2a00', color: '#f59e0b', label: 'Finishing' },
  };

  const s = styles[status?.toLowerCase()] || styles.offline;

  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.03em',
        display: 'inline-block',
      }}
    >
      {s.label}
    </span>
  );
}
