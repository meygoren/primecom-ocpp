import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Zap, ScrollText, Activity, CreditCard, Settings, Users, BatteryCharging, LogOut, Truck, Warehouse, DollarSign, AlertTriangle, SlidersHorizontal, Download, Car, Calendar, Users2, Receipt, ChevronDown, ChevronLeft, ChevronRight, X, Wrench, UserSquare, ShieldAlert, Scale, MapPin } from 'lucide-react';
import { useProfile } from '../contexts/ProfileContext';
import { useFleet, FLEETS } from '../contexts/FleetContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

const ADMIN_OPERATOR_NAV = [
  { to: '/',              icon: LayoutDashboard,   label: 'Dashboard',       settingKey: null },
  { to: '/sessions',      icon: Zap,               label: 'Sessions',        settingKey: null },
  { to: '/logs',          icon: ScrollText,         label: 'Logs',            settingKey: null },
  { to: '/rfid',          icon: CreditCard,         label: 'RFID Tags',       settingKey: 'nav_rfid_tags' },
  { to: '/charge-trucks', icon: Truck,              label: 'Charge Trucks',   settingKey: null },
  { to: '/energy-forward',icon: Warehouse,          label: 'Energy Forward',  settingKey: null },
  { to: '/truck-map',     icon: MapPin,             label: 'Truck Map',       settingKey: null },
  { to: '/billing',       icon: DollarSign,         label: 'Billing',         settingKey: null },
  { to: '/issues',        icon: AlertTriangle,      label: 'Issues',          settingKey: null, badge: true },
  { to: '/vehicles',      icon: Car,                label: 'VINs',            settingKey: null },
  { to: '/fleet-assets',  icon: Wrench,             label: 'Fleet & Assets',  settingKey: null },
  { to: '/customers',     icon: UserSquare,         label: 'Customers',       settingKey: null },
  { to: '/incidents',     icon: ShieldAlert,        label: 'Incidents',       settingKey: null },
  { to: '/ocpp-config',   icon: SlidersHorizontal,  label: 'OCPP Config',     settingKey: null },
  { to: '/export',        icon: Download,           label: 'Export Data',     settingKey: null },
  { to: '/schedules',     icon: Calendar,           label: 'Schedules',       settingKey: null },
  { to: '/fuel-log',      icon: Truck,              label: 'Fuel & Mileage',  settingKey: null },
  { to: '/expenses',      icon: Receipt,            label: 'Expenses',        settingKey: null },
  { to: '/settings',      icon: Settings,           label: 'Settings',        settingKey: null },
];

const ADMIN_ONLY_NAV = [
  { to: '/accounts',   icon: Users,   label: 'Accounts',   settingKey: null },
  { to: '/employees',  icon: Users2,  label: 'Employees',  settingKey: null },
  { to: '/legal',      icon: Scale,   label: 'Legal',      settingKey: null },
];

const LAWYER_NAV = [
  { to: '/legal', icon: Scale, label: 'Legal', settingKey: null },
];

const VIEWER_NAV = [
  { to: '/',              icon: LayoutDashboard,   label: 'Dashboard',       settingKey: null },
  { to: '/sessions',      icon: Zap,               label: 'Sessions',        settingKey: null },
  { to: '/logs',          icon: ScrollText,         label: 'Logs',            settingKey: null },
  { to: '/charge-trucks', icon: Truck,              label: 'Charge Trucks',   settingKey: null },
  { to: '/energy-forward',icon: Warehouse,          label: 'Energy Forward',  settingKey: null },
  { to: '/truck-map',     icon: MapPin,             label: 'Truck Map',       settingKey: null },
  { to: '/billing',       icon: DollarSign,         label: 'Billing',         settingKey: null },
  { to: '/issues',        icon: AlertTriangle,      label: 'Issues',          settingKey: null, badge: true },
  { to: '/vehicles',      icon: Car,                label: 'VINs',            settingKey: null },
  { to: '/fleet-assets',  icon: Wrench,             label: 'Fleet & Assets',  settingKey: null },
  { to: '/customers',     icon: UserSquare,         label: 'Customers',       settingKey: null },
  { to: '/incidents',     icon: ShieldAlert,        label: 'Incidents',       settingKey: null },
  { to: '/ocpp-config',   icon: SlidersHorizontal,  label: 'OCPP Config',     settingKey: null },
  { to: '/export',        icon: Download,           label: 'Export Data',     settingKey: null },
  { to: '/fuel-log',      icon: Truck,              label: 'Fuel & Mileage',  settingKey: null },
  { to: '/expenses',      icon: Receipt,            label: 'Expenses',        settingKey: null },
  { to: '/settings',      icon: Settings,           label: 'Settings',        settingKey: null },
];

const DRIVER_NAV = [
  { to: '/',              icon: BatteryCharging,   label: 'My Charger',     settingKey: null },
  { to: '/charge-trucks', icon: Truck,             label: 'Charge Trucks',  settingKey: null },
  { to: '/energy-forward',icon: Warehouse,         label: 'Energy Forward', settingKey: null },
  { to: '/schedules',     icon: Calendar,          label: 'Schedules',      settingKey: null },
  { to: '/issues',        icon: AlertTriangle,     label: 'Issues',         settingKey: null, badge: true },
  { to: '/expenses',      icon: Receipt,           label: 'Expenses',       settingKey: null },
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
  if (role === 'lawyer') return LAWYER_NAV;
  return [];
}

const ROLE_LABELS = {
  admin:    { label: 'Admin',    color: '#47a141' },
  operator: { label: 'Operator', color: '#3b82f6' },
  viewer:   { label: 'Viewer',   color: '#f59e0b' },
  driver:   { label: 'Driver',   color: '#a855f7' },
  lawyer:   { label: 'Legal',    color: '#06b6d4' },
};

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  );

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = (e) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

function FleetSwitcher({ expanded }) {
  const { fleet, selectFleet, fleets } = useFleet();
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!expanded) {
    return (
      <div ref={ref} style={{ padding: '8px', borderBottom: '1px solid #2e3347', position: 'relative', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          title={fleet.label}
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#22263a',
            border: `1px solid ${open ? fleet.color : '#2e3347'}`,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: fleet.color, flexShrink: 0 }} />
        </button>

        {open && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 8,
            width: 190,
            background: '#1a1d27',
            border: '1px solid #2e3347',
            borderRadius: 8,
            zIndex: 600,
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            {fleets.map((f) => (
              <button
                key={f.id}
                onClick={() => { selectFleet(f.id); setOpen(false); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 12px',
                  background: f.id === fleet.id ? '#22263a' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: f.id === fleet.id ? f.color : '#8892a4',
                  fontSize: 12,
                  fontWeight: f.id === fleet.id ? 700 : 500,
                  textAlign: 'left',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                {f.label}
                {f.id !== 'tower_mobility' && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: '#6b7280', fontStyle: 'italic' }}>Coming soon</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ padding: '8px 12px', borderBottom: '1px solid #2e3347', position: 'relative' }}>
      <div style={{ fontSize: 9, color: '#8892a4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4, paddingLeft: 4 }}>
        Fleet
      </div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#22263a',
          border: `1px solid ${open ? fleet.color : '#2e3347'}`,
          borderRadius: 8,
          padding: '7px 10px',
          cursor: 'pointer',
          color: fleet.color,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: fleet.color, flexShrink: 0 }} />
          {fleet.label}
        </span>
        <ChevronDown size={13} color="#8892a4" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 12,
          right: 12,
          background: '#1a1d27',
          border: '1px solid #2e3347',
          borderRadius: 8,
          zIndex: 600,
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {fleets.map((f) => (
            <button
              key={f.id}
              onClick={() => { selectFleet(f.id); setOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 12px',
                background: f.id === fleet.id ? '#22263a' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: f.id === fleet.id ? f.color : '#8892a4',
                fontSize: 12,
                fontWeight: f.id === fleet.id ? 700 : 500,
                textAlign: 'left',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
              {f.label}
              {f.id !== 'tower_mobility' && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: '#6b7280', fontStyle: 'italic' }}>Coming soon</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ mobileOpen = false, onCloseMobile = () => {} }) {
  const profile = useProfile();
  const role = profile?.role;
  const isDesktop = useIsDesktop();

  const [navItems,   setNavItems]   = useState(() => getNavItems(role));
  const [issueCount, setIssueCount] = useState(0);
  const [expanded, setExpanded] = useState(() => localStorage.getItem('sidebar_expanded') === 'true');

  useEffect(() => { setNavItems(getNavItems(role)); }, [role]);

  useEffect(() => {
    function onStorage() { setNavItems(getNavItems(role)); }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [role]);

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

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_expanded', String(next));
      return next;
    });
  }

  const roleInfo = ROLE_LABELS[role] || null;

  // On mobile the drawer always shows full labels; the collapse toggle only applies on desktop.
  const showLabels = isDesktop ? expanded : true;
  const width = isDesktop ? (expanded ? 220 : 64) : 248;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden"
          onClick={onCloseMobile}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 90 }}
        />
      )}

      <aside
        className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:static inset-y-0 left-0 transition-[width,transform] duration-200 ease-in-out`}
        style={{
          width,
          minHeight: '100vh',
          background: '#1a1d27',
          borderRight: '1px solid #2e3347',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          zIndex: 100,
          overflow: 'visible',
        }}
      >
        {/* Logo + collapse/close toggle */}
        <div style={{
          padding: showLabels ? '20px 16px 16px' : '20px 8px 16px',
          borderBottom: '1px solid #2e3347',
          display: 'flex',
          alignItems: 'center',
          justifyContent: showLabels ? 'space-between' : 'center',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
            <Activity size={22} color="#47a141" style={{ flexShrink: 0 }} />
            {showLabels && (
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9', whiteSpace: 'nowrap' }}>Primecom</div>
                <div style={{ fontSize: 11, color: '#8892a4', whiteSpace: 'nowrap' }}>OCPP Central System</div>
              </div>
            )}
          </div>

          {/* Desktop: collapse/expand. Mobile: close drawer. */}
          <button
            onClick={isDesktop ? toggleExpanded : onCloseMobile}
            title={isDesktop ? (expanded ? 'Collapse sidebar' : 'Expand sidebar') : 'Close menu'}
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: '1px solid #2e3347',
              borderRadius: 6,
              color: '#8892a4',
              cursor: 'pointer',
            }}
          >
            {isDesktop
              ? (expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />)
              : <X size={15} />}
          </button>
        </div>

        {/* Fleet Switcher */}
        <FleetSwitcher expanded={showLabels} />

        {/* Nav */}
        <nav style={{ padding: showLabels ? '12px' : '12px 8px', flex: 1, overflowY: 'auto', overflowX: 'visible' }}>
          {navItems.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to + label}
              to={to}
              end={to === '/'}
              title={!showLabels ? label : undefined}
              onClick={onCloseMobile}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                justifyContent: showLabels ? 'flex-start' : 'center',
                padding: showLabels ? '9px 12px' : '10px',
                borderRadius: 8,
                marginBottom: 2,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? '#47a141' : '#8892a4',
                background: isActive ? '#2d5c2a33' : 'transparent',
                transition: 'all 0.15s',
                position: 'relative',
              })}
            >
              <span style={{ position: 'relative', display: 'flex' }}>
                <Icon size={16} />
                {badge && issueCount > 0 && !showLabels && (
                  <span style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#ef4444',
                    border: '1.5px solid #1a1d27',
                  }} />
                )}
              </span>
              {showLabels && <span style={{ flex: 1 }}>{label}</span>}
              {badge && issueCount > 0 && showLabels && (
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

        <div style={{ padding: showLabels ? '16px 16px' : '12px 8px', borderTop: '1px solid #2e3347' }}>
          {showLabels && roleInfo && (
            <div style={{ fontSize: 10, color: roleInfo.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              {roleInfo.label}
            </div>
          )}
          {showLabels && (
            <div style={{ fontSize: 11, color: '#8892a4', marginBottom: 12 }}>Primecom Technologies LLC</div>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            title="Sign Out"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: showLabels ? 'flex-start' : 'center',
              gap: 8,
              background: 'none',
              border: '1px solid #2e3347',
              borderRadius: 7,
              padding: showLabels ? '7px 12px' : '8px',
              color: '#8892a4',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <LogOut size={13} />
            {showLabels && 'Sign Out'}
          </button>
        </div>
      </aside>
    </>
  );
}
