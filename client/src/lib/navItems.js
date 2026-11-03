import { LayoutDashboard, Zap, ScrollText, CreditCard, Settings, Users, Truck, Warehouse, DollarSign, AlertTriangle, SlidersHorizontal, Download, Car, Calendar, Users2, Receipt, Wrench, UserSquare, ShieldAlert, Scale, MapPin, Building2, Battery } from 'lucide-react';

// Sidebar tabs. Shared with the Locations page, where each location picks
// which of these tabs are shown while it is selected.

export const ADMIN_OPERATOR_NAV = [
  { to: '/',              icon: LayoutDashboard,   label: 'Dashboard',       settingKey: null },
  { to: '/sessions',      icon: Zap,               label: 'Sessions',        settingKey: null },
  { to: '/logs',          icon: ScrollText,         label: 'Logs',            settingKey: null },
  { to: '/bms',           icon: Battery,            label: 'BMS Reports',     settingKey: null },
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

export const ADMIN_ONLY_NAV = [
  { to: '/accounts',   icon: Users,   label: 'Accounts',   settingKey: null },
  { to: '/employees',  icon: Users2,  label: 'Employees',  settingKey: null },
  { to: '/legal',      icon: Scale,   label: 'Legal',      settingKey: null },
];

// Always shown to admins, whichever location is selected — it is where
// locations and their tabs are configured.
export const LOCATIONS_NAV = { to: '/locations', icon: Building2, label: 'Locations', settingKey: null };

// Every tab a location can choose from (Locations page checklist).
export const ALL_TABS = [...ADMIN_OPERATOR_NAV, ...ADMIN_ONLY_NAV];
