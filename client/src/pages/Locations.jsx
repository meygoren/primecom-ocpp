import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Save, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useFleet } from '../contexts/FleetContext';
import { useProfile } from '../contexts/ProfileContext';
import { ALL_TABS } from '../lib/navItems';
import StatusBadge from '../components/StatusBadge';

// Admin page for charging locations / clients (the sidebar "Fleet" dropdown):
// create a location, assign chargers, choose which sidebar tabs it shows,
// and configure battery systems (Primecom / SETEC) used for detection.

const C = {
  bg: '#0f1117', card: '#1a1d27', inner: '#22263a', border: '#2e3347',
  text: '#f1f5f9', muted: '#8892a4', green: '#47a141', red: '#ef4444', amber: '#f59e0b',
};

export default function Locations() {
  const profile = useProfile();
  const navigate = useNavigate();
  const { fleets, reloadFleets, selectFleet } = useFleet();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('id') || fleets[0]?.id;
  const selected = fleets.find((f) => f.id === selectedId);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('');
  const [createError, setCreateError] = useState(null);

  if (profile && profile.role !== 'admin') {
    return <div style={{ padding: 40, color: C.muted }}>Only admins can manage locations.</div>;
  }

  async function createLocation() {
    setCreateError(null);
    try {
      const created = await api.createFleet({ label: newName, city: newCity, dashboard: 'location', nav_tabs: ['/', '/logs', '/ocpp-config'] });
      await reloadFleets();
      setCreating(false);
      setNewName('');
      setNewCity('');
      setParams({ id: created.id });
    } catch (err) {
      setCreateError(err.message);
    }
  }

  return (
    <div style={{ padding: '28px clamp(16px, 3vw, 36px)', maxWidth: 1280 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Locations</h1>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Charging locations and clients shown in the sidebar dropdown. Assign chargers, choose the dashboard and which tabs appear.
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        {/* Location list */}
        <div style={{ ...cardStyle, padding: 10, flex: '1 1 240px', maxWidth: 320 }}>
          {fleets.map((f) => (
            <button
              key={f.id}
              onClick={() => setParams({ id: f.id })}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                background: f.id === selectedId ? C.inner : 'transparent', border: 'none', borderRadius: 8,
                padding: '10px 12px', cursor: 'pointer', color: C.text,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: f.color || C.green, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{f.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: C.muted }}>
                  {f.city || 'No city'} · {f.charger_count ?? 0} charger{f.charger_count === 1 ? '' : 's'}
                </span>
              </span>
            </button>
          ))}

          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 10 }}>
            {creating ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px 4px' }}>
                <input autoFocus placeholder="Location name (e.g. Swift)" value={newName} onChange={(e) => setNewName(e.target.value)} style={inputStyle} />
                <input placeholder="City (e.g. San Francisco, CA)" value={newCity} onChange={(e) => setNewCity(e.target.value)} style={inputStyle} />
                {createError && <div style={{ color: C.red, fontSize: 12 }}>{createError}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={createLocation} disabled={!newName.trim()} style={btnStyle(true)}>Create</button>
                  <button onClick={() => setCreating(false)} style={btnStyle()}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setCreating(true)} style={{ ...btnStyle(), width: '100%', justifyContent: 'center' }}>
                <Plus size={14} /> New location
              </button>
            )}
          </div>
        </div>

        {/* Editor */}
        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {selected ? (
            <LocationEditor
              key={selected.id}
              fleet={selected}
              onSaved={reloadFleets}
              onOpenDashboard={() => { selectFleet(selected.id); navigate('/'); }}
              onDeleted={async () => { await reloadFleets(); setParams({}); }}
            />
          ) : (
            <div style={{ ...cardStyle, color: C.muted }}>Select a location.</div>
          )}
          <BatterySystems fleet={selected} />
        </div>
      </div>
    </div>
  );
}

// --- one location ---------------------------------------------------------------

function LocationEditor({ fleet, onSaved, onOpenDashboard, onDeleted }) {
  const [form, setForm] = useState({
    label: fleet.label || '',
    city: fleet.city || '',
    color: fleet.color || '#47a141',
    dashboard: fleet.dashboard || 'standard',
  });
  const [allTabs, setAllTabs] = useState(!Array.isArray(fleet.nav_tabs));
  const [tabs, setTabs] = useState(Array.isArray(fleet.nav_tabs) ? fleet.nav_tabs : ALL_TABS.map((t) => t.to));
  const [saveMsg, setSaveMsg] = useState(null);

  const [chargers, setChargers] = useState([]);
  const [assigned, setAssigned] = useState(new Set());
  const [chargerMsg, setChargerMsg] = useState(null);
  const [recalcMsg, setRecalcMsg] = useState(null);

  useEffect(() => {
    api.getChargers()
      .then((list) => {
        setChargers(list);
        setAssigned(new Set(list.filter((c) => c.fleet_id === fleet.id).map((c) => c.charger_id)));
      })
      .catch((err) => setChargerMsg({ error: true, text: err.message }));
  }, [fleet.id]);

  async function saveDetails() {
    setSaveMsg(null);
    try {
      await api.updateFleet(fleet.id, { ...form, nav_tabs: allTabs ? null : tabs });
      await onSaved();
      setSaveMsg({ text: 'Saved' });
    } catch (err) {
      setSaveMsg({ error: true, text: err.message });
    }
  }

  async function saveChargers() {
    setChargerMsg(null);
    try {
      await api.setFleetChargers(fleet.id, [...assigned]);
      const list = await api.getChargers();
      setChargers(list);
      await onSaved();
      setChargerMsg({ text: `${assigned.size} charger${assigned.size === 1 ? '' : 's'} assigned` });
    } catch (err) {
      setChargerMsg({ error: true, text: err.message });
    }
  }

  async function remove() {
    if (!window.confirm(`Delete location "${fleet.label}"? Its chargers become unassigned. Charger data and sessions are kept.`)) return;
    try {
      await api.deleteFleet(fleet.id);
      await onDeleted();
    } catch (err) {
      setSaveMsg({ error: true, text: err.message });
    }
  }

  async function recalculate() {
    setRecalcMsg({ text: 'Recalculating…' });
    try {
      const r = await api.recalculateFleet(fleet.id);
      setRecalcMsg({ text: `Updated ${r.updated} of ${r.total} sessions from the last 60 days` });
    } catch (err) {
      setRecalcMsg({ error: true, text: err.message });
    }
  }

  function toggleTab(to) {
    setTabs((prev) => prev.includes(to) ? prev.filter((t) => t !== to) : [...prev, to]);
  }

  function toggleCharger(id) {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const sortedChargers = useMemo(() => [...chargers].sort((a, b) => {
    // This location's chargers first, then unassigned, then others.
    const rank = (c) => (c.fleet_id === fleet.id ? 0 : c.fleet_id ? 2 : 1);
    return rank(a) - rank(b) || a.charger_id.localeCompare(b.charger_id);
  }), [chargers, fleet.id]);

  return (
    <>
      {/* Details */}
      <div style={cardStyle}>
        <CardHeader title={fleet.label} subtitle={`ID: ${fleet.id}`}>
          <button onClick={onOpenDashboard} style={btnStyle()}>Open dashboard</button>
        </CardHeader>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Field label="Name">
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="City">
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Color">
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ ...inputStyle, padding: 2, height: 36, width: 80 }} />
          </Field>
          <Field label="Dashboard">
            <select value={form.dashboard} onChange={(e) => setForm({ ...form, dashboard: e.target.value })} style={inputStyle}>
              <option value="location">Location energy dashboard (this location's chargers only)</option>
              <option value="standard">Standard dashboard (all chargers)</option>
            </select>
          </Field>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 8 }}>Sidebar tabs while this location is selected</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={allTabs} onChange={(e) => setAllTabs(e.target.checked)} />
            Show all tabs
          </label>
          {!allTabs && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
              {ALL_TABS.map((t) => {
                const Icon = t.icon;
                const on = tabs.includes(t.to);
                return (
                  <label key={t.to} style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer',
                    color: on ? C.text : C.muted, background: on ? C.inner : 'transparent',
                    border: `1px solid ${on ? C.green + '66' : C.border}`, borderRadius: 8, padding: '7px 10px',
                  }}>
                    <input type="checkbox" checked={on} onChange={() => toggleTab(t.to)} />
                    <Icon size={14} /> {t.label}
                  </label>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Admins always see Locations so they can change this later.</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <button onClick={saveDetails} disabled={!form.label.trim()} style={btnStyle(true)}><Save size={14} /> Save location</button>
          {fleet.id !== 'tower_mobility' && (
            <button onClick={remove} style={{ ...btnStyle(), color: C.red }}><Trash2 size={14} /> Delete</button>
          )}
          <Msg msg={saveMsg} />
        </div>
      </div>

      {/* Chargers */}
      <div style={cardStyle}>
        <CardHeader title="Chargers" subtitle={`Tick the chargers installed at ${fleet.label}. A charger belongs to one location at a time.`}>
          <button onClick={saveChargers} style={btnStyle(true)}><Save size={14} /> Save chargers</button>
        </CardHeader>
        <Msg msg={chargerMsg} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 8, marginTop: 8 }}>
          {sortedChargers.map((c) => {
            const on = assigned.has(c.charger_id);
            const elsewhere = c.fleet_id && c.fleet_id !== fleet.id;
            return (
              <label key={c.charger_id} style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                background: on ? C.inner : 'transparent', border: `1px solid ${on ? C.green + '66' : C.border}`,
                borderRadius: 8, padding: '9px 12px',
              }}>
                <input type="checkbox" checked={on} onChange={() => toggleCharger(c.charger_id)} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text }}>{c.charger_id}</span>
                  <span style={{ display: 'block', fontSize: 11, color: elsewhere && on ? C.amber : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {elsewhere ? (on ? `Will move from ${c.fleet_id}` : `At ${c.fleet_id}`) : (c.location_label || c.model || ' ')}
                  </span>
                </span>
                <StatusBadge status={c.status} />
              </label>
            );
          })}
        </div>
        {chargers.length === 0 && !chargerMsg && <div style={{ color: C.muted, fontSize: 13 }}>Loading chargers…</div>}
      </div>

      {/* Recalculate */}
      {fleet.dashboard === 'location' && (
        <div style={cardStyle}>
          <CardHeader
            title="Session summaries"
            subtitle="New sessions are summarised automatically. Rebuild past sessions (last 60 days) after assigning chargers or entering battery MAC addresses."
          >
            <button onClick={recalculate} style={btnStyle()}><RefreshCw size={14} /> Recalculate</button>
          </CardHeader>
          <Msg msg={recalcMsg} />
        </div>
      )}
    </>
  );
}

// --- battery systems ----------------------------------------------------------------

function BatterySystems({ fleet }) {
  const [systems, setSystems] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [msg, setMsg] = useState(null);
  const [tags, setTags] = useState([]);

  async function load() {
    try {
      const list = await api.getBatterySystems();
      setSystems(list);
      setDrafts(Object.fromEntries(list.map((s) => [s.id, {
        label: s.label,
        capacity_kwh: String(s.capacity_kwh ?? ''),
        macs: (s.mac_addresses || []).join('\n'),
      }])));
    } catch (err) {
      setMsg({ error: true, text: err.message });
    }
  }

  useEffect(() => { load(); }, []);

  const fleetId = fleet?.id;
  useEffect(() => {
    if (!fleetId) return;
    api.getFleetTags(fleetId).then(setTags).catch(() => setTags([]));
  }, [fleetId]);

  async function save(id, overrideMacs) {
    setMsg(null);
    const d = drafts[id];
    try {
      await api.updateBatterySystem(id, {
        label: d.label,
        capacity_kwh: d.capacity_kwh,
        mac_addresses: (overrideMacs ?? d.macs).split(/[\s,]+/).filter(Boolean),
      });
      await load();
      if (fleetId) setTags(await api.getFleetTags(fleetId));
      setMsg({ text: 'Battery systems saved. Use Recalculate to apply to past sessions.' });
    } catch (err) {
      setMsg({ error: true, text: err.message });
    }
  }

  function assignTag(tag, systemId) {
    const macs = drafts[systemId].macs.split(/[\s,]+/).filter(Boolean);
    if (!macs.includes(tag)) macs.push(tag);
    const text = macs.join('\n');
    setDrafts((prev) => ({ ...prev, [systemId]: { ...prev[systemId], macs: text } }));
    save(systemId, text);
  }

  return (
    <div style={cardStyle}>
      <CardHeader
        title="Battery systems"
        subtitle="Shared by all locations. Each session is matched by battery MAC first; without a MAC, the pack size is estimated from energy delivered vs SoC change."
      />
      <Msg msg={msg} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14, marginTop: 8 }}>
        {systems.map((s) => {
          const d = drafts[s.id] || {};
          return (
            <div key={s.id} style={{ background: C.inner, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color || C.muted }} />
                <span style={{ fontWeight: 700, color: C.text }}>{s.label}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Name">
                  <input value={d.label ?? ''} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, label: e.target.value } })} style={inputStyle} />
                </Field>
                <Field label="Capacity (kWh)">
                  <input type="number" value={d.capacity_kwh ?? ''} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, capacity_kwh: e.target.value } })} style={inputStyle} />
                </Field>
              </div>
              <Field label="Battery MAC addresses (one per line)" style={{ marginTop: 10 }}>
                <textarea
                  rows={3}
                  value={d.macs ?? ''}
                  placeholder="e.g. 00:1A:2B:3C:4D:5E"
                  onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, macs: e.target.value } })}
                  style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
                />
              </Field>
              <button onClick={() => save(s.id)} style={{ ...btnStyle(true), marginTop: 10 }}><Save size={14} /> Save</button>
            </div>
          );
        })}
      </div>

      {fleet && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>MACs and ID tags seen at {fleet.label}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2, marginBottom: 10 }}>
            Last 90 days. Chargers using Autocharge report the battery MAC as the ID tag. Click a system to link a MAC to it.
          </div>
          {tags.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13 }}>No sessions recorded at this location yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>{['MAC / ID tag', 'Sessions', 'Energy', 'Last seen', 'Linked to'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: C.muted, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {tags.map((t) => (
                    <tr key={t.tag} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: C.text }}>
                        {t.tag}
                        {!t.is_mac && <span style={{ fontFamily: 'inherit', fontSize: 11, color: C.muted, marginLeft: 6 }}>(not a MAC)</span>}
                      </td>
                      <td style={{ padding: '8px 10px', color: C.muted }}>{t.sessions}</td>
                      <td style={{ padding: '8px 10px', color: C.muted }}>{t.total_kwh} kWh</td>
                      <td style={{ padding: '8px 10px', color: C.muted, whiteSpace: 'nowrap' }}>{new Date(t.last_seen).toLocaleDateString()}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {t.matched_system ? (
                          <span style={{ color: C.text, fontWeight: 600 }}>{systems.find((s) => s.id === t.matched_system)?.label || t.matched_system}</span>
                        ) : t.is_mac ? (
                          <span style={{ display: 'flex', gap: 6 }}>
                            {systems.map((s) => (
                              <button key={s.id} onClick={() => assignTag(t.tag, s.id)} style={{ ...btnStyle(), padding: '3px 10px', fontSize: 12 }}>{s.label}</button>
                            ))}
                          </span>
                        ) : <span style={{ color: C.muted }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- small pieces -------------------------------------------------------------------

function CardHeader({ title, subtitle, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: 'block', ...style }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}

function Msg({ msg }) {
  if (!msg) return null;
  return <span style={{ fontSize: 12, color: msg.error ? C.red : C.green }}>{msg.text}</span>;
}

function btnStyle(primary) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: primary ? C.green : C.inner, border: `1px solid ${primary ? C.green : C.border}`,
    borderRadius: 8, padding: '7px 14px', color: primary ? '#fff' : C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };
}

const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 };
const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none',
};
