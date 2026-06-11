const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  getChargers: () => request('/api/chargers'),
  getCharger: (id) => request(`/api/chargers/${encodeURIComponent(id)}`),
  updateCharger: (id, body) =>
    request(`/api/chargers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  getSessions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/sessions${q ? '?' + q : ''}`);
  },
  getLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/logs${q ? '?' + q : ''}`);
  },
  sendCommand: (id, action, body = {}) =>
    request(`/api/commands/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // RFID tags
  getRfidTags: () => request('/api/rfid'),
  addRfidTag: (tag, label) =>
    request('/api/rfid', {
      method: 'POST',
      body: JSON.stringify({ tag, label }),
    }),
  deleteRfidTag: (tag) =>
    request(`/api/rfid/${encodeURIComponent(tag)}`, { method: 'DELETE' }),
};
