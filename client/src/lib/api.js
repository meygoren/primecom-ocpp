import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Chargers
  getChargers: () => request('/api/chargers'),
  getCharger: (id) => request(`/api/chargers/${encodeURIComponent(id)}`),
  updateCharger: (id, body) =>
    request(`/api/chargers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // Sessions
  getSessions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/sessions${q ? '?' + q : ''}`);
  },

  // Logs
  getLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/logs${q ? '?' + q : ''}`);
  },

  // Commands
  sendCommand: (id, action, body = {}) =>
    request(`/api/commands/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Firmware history
  getFirmwareHistory: (id) => request(`/api/chargers/${encodeURIComponent(id)}/firmware`),

  // RFID tags
  getRfidTags: () => request('/api/rfid'),
  addRfidTag: (tag, label) => request('/api/rfid', { method: 'POST', body: JSON.stringify({ tag, label }) }),
  deleteRfidTag: (tag) => request(`/api/rfid/${encodeURIComponent(tag)}`, { method: 'DELETE' }),

  // Current user profile + visible chargers
  getMe: () => request('/api/me'),
  getMyChargers: () => request('/api/me/chargers'),
  getDriverView: () => request('/api/me/driver'),

  // Notifications
  getNotifications: () => request('/api/notifications'),
  markNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request('/api/notifications/read-all', { method: 'POST' }),
  getNotificationPrefs: () => request('/api/notifications/preferences'),
  setNotificationPrefs: (body) => request('/api/notifications/preferences', { method: 'PUT', body: JSON.stringify(body) }),

  // Charge Trucks
  getChargeTrucks: () => request('/api/charge-trucks'),
  updateChargeTruck: (id, body) => request(`/api/charge-trucks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getWarehouseChargers: () => request('/api/charge-trucks/warehouse'),
  updateWarehouseCharger: (id, body) => request(`/api/charge-trucks/warehouse/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // EF Supervisors
  getEfSupervisors: () => request('/api/ef-supervisors'),
  addEfSupervisor: (body) => request('/api/ef-supervisors', { method: 'POST', body: JSON.stringify(body) }),
  updateEfSupervisor: (id, body) => request(`/api/ef-supervisors/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEfSupervisor: (id) => request(`/api/ef-supervisors/${id}`, { method: 'DELETE' }),
  getEfSettings: () => request('/api/ef-supervisors/settings'),
  saveEfSettings: (body) => request('/api/ef-supervisors/settings', { method: 'PUT', body: JSON.stringify(body) }),
  sendTestSms: () => request('/api/ef-supervisors/test-sms', { method: 'POST' }),

  // Admin — user management
  adminGetUsers: () => request('/api/admin/users'),
  adminCreateUser: (body) => request('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  adminUpdateUser: (id, body) =>
    request(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminDeleteUser: (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
  adminGetUserChargers: (id) => request(`/api/admin/users/${id}/chargers`),
  adminSetUserChargers: (id, charger_ids) =>
    request(`/api/admin/users/${id}/chargers`, { method: 'PUT', body: JSON.stringify({ charger_ids }) }),

  // Billing
  getBillingSummary: (period) => request(`/api/billing/summary?period=${period}`),
  getBillingSettings: () => request('/api/billing/settings'),
  saveBillingSettings: (body) => request('/api/billing/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  sendBillingReport: () => request('/api/billing/send-report', { method: 'POST' }),

  // Charge trucks (used by Issues page for truck list)
  getChargeTrucks: () => request('/api/charge-trucks'),

  // Issues
  getIssues: (query = '') => request(`/api/issues${query}`),
  getIssueOpenCount: () => request('/api/issues/open-count'),
  createIssue: (body) => request('/api/issues', { method: 'POST', body: JSON.stringify(body) }),
  updateIssue: (id, body) => request(`/api/issues/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteIssue: (id) => request(`/api/issues/${id}`, { method: 'DELETE' }),
  getIssueSettings: () => request('/api/issues/settings'),
  saveIssueSettings: (body) => request('/api/issues/settings', { method: 'PATCH', body: JSON.stringify(body) }),
};
