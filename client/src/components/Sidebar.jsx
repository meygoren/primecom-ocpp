import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Zap, ScrollText, Activity, CreditCard, Settings, Users, BatteryCharging, LogOut, Truck, Warehouse, DollarSign, AlertTriangle } from 'lucide-react';
import { useProfile } from '../contexts/ProfileContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

const ADMIN_OPERATOR_NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard',  settingKey: null },
  { to: '/sessions', icon: Zap,             label: 'Sessions',   settingKey: null },
  { to: '/logs',     icon: ScrollText,      label: 'Logs',       settingKey: null },
  { to: '/rfid',           icon: CreditCard,      label: 'RFID Tags',      settingKey: 'nav_rfid_tags' },
  { to: '/charge-trucks',  icon: Truck,           label: 'Charge Trucks',  settingKey: null },
  { to: '/energy-forward', icon: Warehouse,       label: 'Energy Forward', settingKey: null },
  { to: '/billing',        icon: DollarSign,      label: 'Billing',        settingKey: null },
  { to: '/issues',         icon: AlertTriangle,   label: 'Issues',         settingKey: null, badge: true },
  { to: '/settings',       icon: Settings,        label: 'Settings',       settingKey: null },
];

const ADMIN_ONLY_NAV = [
  { to: '/accounts', icon: Users, label: 'Accounts', settingKey: null },
];

const VIEWER_NAV = [
  { to: '/',               icon: LayoutDashboard, label: 'Dashboard',      settingKey: null },
  { to: '/sessions',       icon: Zap,             label: 'Sessions',       settingKey: null },
  { to: '/logs',           icon: ScrollText,      label: 'Logs',           settingKey: null },
  { to: '/charge-trucks',  icon: Truck,           label: 'Charge Trucks',  settingKey: null },
  { to: '/energy-forward', icon: Warehouse,       label: 'Energy Forward', settingKey: null },
  { to: '/billing',        icon: DollarSign,      label: 'Billing',        settingKey: null },
  { to: '/issues',         icon: AlertTriangle,   label: 'Issues',         settingKey: null, badge: true },
  { to: '/settings',       icon: Settings,        label: 'Settings',       settingKey: null },
];

const DRIVER_NAV = [
  { to: '/',       icon: BatteryCharging, label: 'My Charger', settingKey: null },
  { to: '/issues', icon: AlertTriangle,   label: 'Issues',     settingKey: null, badge: true },
];

function getNavItems(role) {
  if (role === 'admin') {
    return [...ADMIN_OPERATOR_NAV, ...ADMIN_ONLY_NAV].filter((item) => {
      if (!item.settingKey) return true;
      return localStorage.getItem(`settings_${item.settingKey}`) !== 'false';
    });
  }
  if (role === 'operator') {
    return ADMIN_OPERATOR_NAV.filter((item) => {
      if (!item.settingKey) return true;
      return localStorage.getItem(`settings_${item.settingKey}`) !== 'false';
    });
  }
  if (role === 'viewer') return VIEWER_NAV;
  if (role === 'driver') return DRIVER_NAV;
  return [];
}

const ROLE_LABELS = {
  admin: { label: 'Admin', color: '#47a141' },
  operator: { label: 'Operator', color: '#3b82f6' },
  viewer: { label: 'Viewer', color: '#f59e0b' },
  driver: { label: 'Driver', color: '#a855f7' },
};

export default function Sidebar() {
  const profile = useProfile();
  const role = profile?.role;

  const [navItems,    setNavItems]    = useState(() => getNavItems(role));
  const [issueCount,  setIssueCount]  = useState(0);

  useEffect(() => { setNavItems(getNavItems(role)); }, [role]);

  useEffect(() => {
    function onStorage() { setNavItems(getNavItems(role)); }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [role]);

  // Poll open issue count for the badge
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await api.getIssueOpenCount();
        if (!cancelled) setIssueCount(data.count || 0);
      } catch {}
    }
    poll();
    const iv = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const roleInfo = ROLE_LABELS[role] || null;

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
        {navItems.map(({ to, icon: Icon, label, badge }) => (
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
            <span style={{ flex: 1 }}>{label}</span>
            {badge && issueCount > 0 && (
              <span style={{
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                background: '#ef4444',
                color: '#fff',
                fontSize: 9,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
              }}>
                {issueCount > 99 ? '99+' : issueCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '16px 24px', borderTop: '1px solid #2e3347' }}>
        {roleInfo && (
          <div style={{ fontSize: 10, color: roleInfo.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            {roleInfo.label}
          </div>
        )}
        <div style={{ fontSize: 11, color: '#8892a4', marginBottom: 12 }}>Primecom Technologies LLC</div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: '1px solid #2e3347',
            borderRadius: 7,
            padding: '7px 12px',
            color: '#8892a4',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          <LogOut size={13} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
