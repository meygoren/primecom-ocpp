import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';

const PACK_KWH = 450;
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

// ── helpers ──────────────────────────────────────────────────────────────────

function socColor(soc) {
  if (soc == null) return '#6b7280';
  if (soc >= 80) return '#47a141';
  if (soc >= 20) return '#3b82f6';
  return '#f59e0b';
}

function formatRelTime(ts) {
  if (!ts) return 'unknown';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Google Maps loader ────────────────────────────────────────────────────────

let _mapsPromise = null;
function loadGoogleMaps(key) {
  if (!key) return Promise.reject(new Error('NO_KEY'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (_mapsPromise) return _mapsPromise;
  _mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => { _mapsPromise = null; reject(new Error('Failed to load Google Maps')); };
    document.head.appendChild(script);
  });
  return _mapsPromise;
}

// ── Marker SVG factory (data-URI) ─────────────────────────────────────────────

function markerSvg(number, color, isSelected) {
  const ring = isSelected ? `<circle cx="20" cy="20" r="19" fill="none" stroke="${color}" stroke-width="3" opacity="0.5"/>` : '';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      ${ring}
      <circle cx="20" cy="20" r="16" fill="${color}" stroke="#0f1117" stroke-width="2"/>
      <text x="20" y="25" text-anchor="middle" font-size="13" font-weight="800"
        font-family="Inter,system-ui,sans-serif" fill="#fff">${number}</text>
    </svg>`
  )}`;
}

// ── TruckCard (sidebar) ────────────────────────────────────────────────────────

function TruckCard({ truck, isSelected, onClick }) {
  const pSoc  = truck.passenger?.soc ?? null;
  const dSoc  = truck.driver?.soc ?? null;
  const pSt   = truck.passenger?.status || 'offline';
  const dSt   = truck.driver?.status || 'offline';
  const hasLoc = !!truck.location;
  const dotColor = (pSt === 'charging' || dSt === 'charging') ? '#3b82f6'
                 : (pSt !== 'offline' || dSt !== 'offline') ? '#47a141'
                 : '#6b7280';

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        background: isSelected ? '#1e2a3a' : '#1a1d27',
        border: `1px solid ${isSelected ? '#3b82f6' : '#2e3347'}`,
        cursor: 'pointer',
        marginBottom: 8,
        transition: 'border-color 0.15s, background 0.15s',
        boxShadow: isSelected ? '0 0 0 1px #3b82f644' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: dotColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {truck.truck_number}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{truck.label}</div>
        </div>
        {hasLoc && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#47a141', boxShadow: '0 0 5px #47a14188' }} />}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { label: 'P', soc: pSoc, status: pSt },
          { label: 'D', soc: dSoc, status: dSt },
        ].map(({ label, soc, status }) => (
          <div key={label} style={{ flex: 1, background: '#0f1117', borderRadius: 7, padding: '7px 8px', border: '1px solid #2e3347' }}>
            <div style={{ fontSize: 9, color: '#8892a4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{label}-Side</div>
            {soc != null ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: socColor(soc), lineHeight: 1 }}>{Math.round(soc)}%</div>
                <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: '#22263a', overflow: 'hidden' }}>
                  <div style={{ width: `${soc}%`, height: '100%', background: socColor(soc), borderRadius: 2, transition: 'width 0.6s' }} />
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{status === 'offline' ? 'Offline' : 'No SoC'}</div>
            )}
          </div>
        ))}
      </div>

      {truck.location ? (
        <div style={{ marginTop: 7, fontSize: 10, color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
          <span>{parseFloat(truck.location.lat).toFixed(5)}, {parseFloat(truck.location.lng).toFixed(5)}</span>
          <span>{formatRelTime(truck.location.recorded_at)}</span>
        </div>
      ) : (
        <div style={{ marginTop: 7, fontSize: 10, color: '#4b5563' }}>No GPS data yet</div>
      )}
    </div>
  );
}

// ── InfoBox (shown in map when truck is selected) ─────────────────────────────

function InfoBox({ truck, onClose }) {
  if (!truck) return null;
  const pSoc = truck.passenger?.soc ?? null;
  const dSoc = truck.driver?.soc ?? null;

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      right: 16,
      width: 240,
      background: '#1a1d27',
      border: '1px solid #3b82f644',
      borderRadius: 12,
      padding: 16,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>{truck.label}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8892a4', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
      </div>

      {[{ label: 'Passenger', soc: pSoc, charger: truck.passenger }, { label: 'Driver', soc: dSoc, charger: truck.driver }].map(({ label, soc, charger }) => (
        <div key={label} style={{ marginBottom: 10, padding: '8px 10px', background: '#0f1117', borderRadius: 8, border: '1px solid #2e3347' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {soc != null ? (
              <>
                <span style={{ fontSize: 22, fontWeight: 800, color: socColor(soc), lineHeight: 1 }}>{Math.round(soc)}%</span>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 6, borderRadius: 3, background: '#22263a', overflow: 'hidden' }}>
                    <div style={{ width: `${soc}%`, height: '100%', background: socColor(soc), borderRadius: 3, transition: 'width 0.6s' }} />
                  </div>
                  <div style={{ fontSize: 9, color: '#6b7280', marginTop: 3 }}>
                    {((soc / 100) * PACK_KWH).toFixed(0)} / {PACK_KWH} kWh
                  </div>
                </div>
              </>
            ) : (
              <span style={{ fontSize: 12, color: '#6b7280' }}>No data</span>
            )}
          </div>
          {charger?.charger_id && (
            <div style={{ fontSize: 10, color: '#4b5563', marginTop: 5, fontFamily: 'monospace' }}>{charger.charger_id}</div>
          )}
          {charger?.status && (
            <div style={{ fontSize: 10, marginTop: 3, color: charger.status === 'charging' ? '#3b82f6' : charger.status === 'offline' ? '#6b7280' : '#47a141', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {charger.status}
            </div>
          )}
        </div>
      ))}

      {truck.location && (
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
          <div>GPS: {parseFloat(truck.location.lat).toFixed(5)}, {parseFloat(truck.location.lng).toFixed(5)}</div>
          {truck.location.speed_mph != null && <div>Speed: {parseFloat(truck.location.speed_mph).toFixed(0)} mph</div>}
          <div>Updated {formatRelTime(truck.location.recorded_at)}</div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TruckMap() {
  const [trucks, setTrucks]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [mapsError, setMapsError]         = useState(null);
  const [selectedTruckId, setSelectedTruckId] = useState(null);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});

  const load = useCallback(async () => {
    try {
      const data = await api.getTruckMapData();
      setTrucks(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  // Init Google Maps once the div is available
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    loadGoogleMaps(API_KEY)
      .then((maps) => {
        mapInstance.current = new maps.Map(mapRef.current, {
          zoom: 10,
          center: { lat: 37.4, lng: -121.9 }, // San Jose area default
          mapTypeId: 'roadmap',
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#1e2030' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1d27' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#8892a4' }] },
            { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2e3347' }] },
            { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2e3347' }] },
            { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1d27' }] },
            { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8892a4' }] },
            { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4060' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1117' }] },
            { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
          ],
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
      })
      .catch((err) => {
        if (err.message === 'NO_KEY') {
          setMapsError('no_key');
        } else {
          setMapsError(err.message);
        }
      });
  }, []);

  // Update markers whenever trucks data changes
  useEffect(() => {
    const gm = window.google?.maps;
    const map = mapInstance.current;
    if (!gm || !map) return;

    const trucksWithLoc = trucks.filter((t) => t.location?.lat != null);

    // Remove markers for trucks that no longer exist
    for (const [id, marker] of Object.entries(markersRef.current)) {
      if (!trucks.find((t) => String(t.id) === id)) {
        marker.setMap(null);
        delete markersRef.current[id];
      }
    }

    for (const truck of trucksWithLoc) {
      const pos = { lat: parseFloat(truck.location.lat), lng: parseFloat(truck.location.lng) };
      const isSelected = selectedTruckId === truck.id;
      const pSt = truck.passenger?.status || 'offline';
      const dSt = truck.driver?.status || 'offline';
      const color = (pSt === 'charging' || dSt === 'charging') ? '#3b82f6'
                  : (pSt !== 'offline' || dSt !== 'offline') ? '#47a141'
                  : '#6b7280';

      if (markersRef.current[truck.id]) {
        const m = markersRef.current[truck.id];
        m.setPosition(pos);
        m.setIcon({ url: markerSvg(truck.truck_number, color, isSelected), scaledSize: new gm.Size(40, 40), anchor: new gm.Point(20, 20) });
      } else {
        const marker = new gm.Marker({
          position: pos,
          map,
          title: truck.label,
          icon: { url: markerSvg(truck.truck_number, color, isSelected), scaledSize: new gm.Size(40, 40), anchor: new gm.Point(20, 20) },
        });
        marker.addListener('click', () => setSelectedTruckId((cur) => cur === truck.id ? null : truck.id));
        markersRef.current[truck.id] = marker;
      }
    }

    // Fit bounds to all truck locations on first load
    if (trucksWithLoc.length > 0 && trucks.length === trucksWithLoc.length) {
      const bounds = new gm.LatLngBounds();
      trucksWithLoc.forEach((t) => bounds.extend({ lat: parseFloat(t.location.lat), lng: parseFloat(t.location.lng) }));
      map.fitBounds(bounds, 80);
    }
  }, [trucks, selectedTruckId]);

  // When a truck is selected, pan the map to it
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || selectedTruckId == null) return;
    const truck = trucks.find((t) => t.id === selectedTruckId);
    if (truck?.location) {
      map.panTo({ lat: parseFloat(truck.location.lat), lng: parseFloat(truck.location.lng) });
      if (map.getZoom() < 13) map.setZoom(13);
    }
  }, [selectedTruckId, trucks]);

  const selectedTruck = trucks.find((t) => t.id === selectedTruckId) || null;
  const trucksWithLoc = trucks.filter((t) => t.location);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', background: '#0f1117' }}>

      {/* Left sidebar */}
      <div style={{
        width: 280,
        flexShrink: 0,
        background: '#1a1d27',
        borderRight: '1px solid #2e3347',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #2e3347' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Truck Tracker</h2>
          <div style={{ fontSize: 12, color: '#8892a4', marginTop: 3 }}>
            {trucksWithLoc.length} of {trucks.length} trucks have GPS · refreshes every 30s
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {loading && <div style={{ color: '#8892a4', padding: 20, fontSize: 13 }}>Loading trucks...</div>}
          {error && <div style={{ color: '#ef4444', padding: 12, fontSize: 12 }}>{error}</div>}
          {trucks.map((truck) => (
            <TruckCard
              key={truck.id}
              truck={truck}
              isSelected={selectedTruckId === truck.id}
              onClick={() => setSelectedTruckId((cur) => cur === truck.id ? null : truck.id)}
            />
          ))}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid #2e3347', fontSize: 10, color: '#4b5563' }}>
          GPS data is sent by Primecom chargers via OCPP DataTransfer (messageId: GPS)
        </div>
      </div>

      {/* Map area */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* The map div */}
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {/* Selected truck info box */}
        {selectedTruck && <InfoBox truck={selectedTruck} onClose={() => setSelectedTruckId(null)} />}

        {/* No API key overlay */}
        {mapsError === 'no_key' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: '#0f1117',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16, padding: 40,
          }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#22263a', border: '2px solid #2e3347', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
              🗺
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>Google Maps API Key Required</div>
              <div style={{ fontSize: 13, color: '#8892a4', maxWidth: 440, lineHeight: 1.6 }}>
                Add <code style={{ background: '#22263a', padding: '2px 6px', borderRadius: 4, color: '#47a141', fontFamily: 'monospace' }}>VITE_GOOGLE_MAPS_KEY</code> to your Railway environment variables and redeploy the frontend service to enable the live truck map.
              </div>
            </div>
          </div>
        )}

        {/* Other map error */}
        {mapsError && mapsError !== 'no_key' && (
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#1a1d27', border: '1px solid #ef444444', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: '#ef4444' }}>
            Map error: {mapsError}
          </div>
        )}

        {/* No location data banner */}
        {!mapsError && !loading && trucksWithLoc.length === 0 && (
          <div style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: '#1a1d2799', border: '1px solid #2e3347', borderRadius: 8,
            padding: '10px 20px', fontSize: 12, color: '#8892a4',
            backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
          }}>
            Waiting for GPS data from trucks...
          </div>
        )}
      </div>
    </div>
  );
}
