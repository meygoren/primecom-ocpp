import { createContext, useContext, useState } from 'react';

export const FLEETS = [
  { id: 'tower_mobility', label: 'Tower Mobility', color: '#47a141' },
  { id: 'bali_express',   label: 'Bali Express',   color: '#3b82f6' },
  { id: 'avis_sd',        label: 'Avis SD',         color: '#f59e0b' },
  { id: 'avis_sf',        label: 'Avis SF',         color: '#a855f7' },
];

const FleetContext = createContext(null);

export function FleetProvider({ children }) {
  const [fleetId, setFleetId] = useState(
    () => localStorage.getItem('selected_fleet') || 'tower_mobility'
  );

  function selectFleet(id) {
    localStorage.setItem('selected_fleet', id);
    setFleetId(id);
  }

  const fleet = FLEETS.find((f) => f.id === fleetId) || FLEETS[0];

  return (
    <FleetContext.Provider value={{ fleetId, fleet, selectFleet, fleets: FLEETS }}>
      {children}
    </FleetContext.Provider>
  );
}

export function useFleet() {
  return useContext(FleetContext);
}
