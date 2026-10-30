import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

// Fallback list used until the server answers (or if supabase_migration_locations.sql
// has not been run yet). The real list lives in the `fleets` table and is
// managed on the Locations page.
export const FLEETS = [
  { id: 'tower_mobility', label: 'Tower Mobility', color: '#47a141', dashboard: 'standard', nav_tabs: null },
  { id: 'bali_express',   label: 'Bali Express',   color: '#3b82f6', dashboard: 'standard', nav_tabs: null },
  { id: 'avis_sd',        label: 'Avis SD',         color: '#f59e0b', dashboard: 'standard', nav_tabs: null },
  { id: 'avis_sf',        label: 'Avis SF',         color: '#a855f7', dashboard: 'standard', nav_tabs: null },
];

const FleetContext = createContext(null);

export function FleetProvider({ session, children }) {
  const [fleets, setFleets] = useState(FLEETS);
  const [fleetsLoaded, setFleetsLoaded] = useState(false);
  const [fleetId, setFleetId] = useState(
    () => localStorage.getItem('selected_fleet') || 'tower_mobility'
  );

  const reloadFleets = useCallback(() => {
    return api.getFleets()
      .then((data) => {
        if (Array.isArray(data) && data.length) setFleets(data);
      })
      .catch((err) => console.warn('[Fleets] Using built-in list:', err.message))
      .finally(() => setFleetsLoaded(true));
  }, []);

  const token = session?.access_token;
  useEffect(() => {
    if (token) reloadFleets();
  }, [token, reloadFleets]);

  function selectFleet(id) {
    localStorage.setItem('selected_fleet', id);
    setFleetId(id);
  }

  const fleet = fleets.find((f) => f.id === fleetId) || fleets[0];

  // A 'location' fleet scopes the Dashboard, Logs and OCPP Config pages to
  // its own chargers. 'standard' keeps the original all-chargers views.
  const isLocation = fleet?.dashboard === 'location';

  return (
    <FleetContext.Provider value={{ fleetId: fleet?.id, fleet, selectFleet, fleets, fleetsLoaded, reloadFleets, isLocation }}>
      {children}
    </FleetContext.Provider>
  );
}

export function useFleet() {
  return useContext(FleetContext);
}
