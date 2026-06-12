import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Zap, ScrollText, Activity, CreditCard, Settings, Users } from 'lucide-react';
import { useProfile } from '../contexts/ProfileContext';

const BASE_NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard',  settingKey: null,            adminOnly: false },
  { to: '/sessions', icon: Zap,             label: 'Sessions',   settingKey: null,            adminOnly: false },
  { to: '/logs',     icon: ScrollText,      label: 'Logs',       settingKey: null,            adminOnly: false },
];

const CONDITIONAL_NAV = [
  { to: '/rfid',     icon: CreditCard,      label: 'RFID Tags',  settingKey: 'nav_rfid_tags', adminOnly: false },
  { to: '/accounts', icon: Users,           label: 'Accounts',   settingKey: null,            adminOnly: true  },
  { to: '/settings', icon: Settings,        label: 'Settings',   settingKey: null,            adminOnly: false },
];

function getNavItems(isAdmin) {
  return [
    ...BASE_NAV,
    ...CONDITIONAL_NAV.filter((item) => {
      if (item.adminOnly && !isAdmin) return false;
      if (!item.settingKey) return true;
      return localStorage.getItem(`settings_${item.settingKey}`) !== 'false';
    }),
  ];
}

export default function Sidebar() {
  const profile = useProfile();
  const isAdmin = profile?.role === 'admin';

  const [navItems, setNavItems] = useState(() => getNavItems(false));

  useEffect(() => {
    setNavItems(getNavItems(isAdmin));
  }, [isAdmin]);

  useEffect(() => {
    function onStorage() { setNavItems(getNavItems(isAdmin)); }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [isAdmin]);

  return (
    <aside
      style={{
        width: 220,
        minHeight: '100vh',
        background: '#1a1d27',
        borderRight: '1px solid #2e3347',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #2e3347' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={22} color="#47a141" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Primecom</div>
            <div style={{ fontSize: 11, color: '#8892a4' }}>OCPP Central System</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 12px', flex: 1 }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 8,
              marginBottom: 2,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 500,
              color: isActive ? '#47a141' : '#8892a4',
              background: isActive ? '#2d5c2a33' : 'transparent',
              transition: 'all 0.15s',
            })}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '16px 24px', borderTop: '1px solid #2e3347' }}>
        {isAdmin && (
          <div style={{ fontSize: 10, color: '#47a141', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            Admin
          </div>
        )}
        <div style={{ fontSize: 11, color: '#8892a4' }}>Primecom Technologies LLC</div>
      </div>
    </aside>
  );
}
