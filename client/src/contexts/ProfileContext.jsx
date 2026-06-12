import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

const ProfileContext = createContext(null);

export function ProfileProvider({ session, children }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    api.getMe()
      .then((data) => setProfile(data.profile || { role: 'user' }))
      .catch(() => setProfile({ role: 'user' }));
  }, [session?.access_token]);

  return (
    <ProfileContext.Provider value={profile}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
