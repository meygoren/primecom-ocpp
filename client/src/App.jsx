import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import DriverDashboard from './pages/DriverDashboard';
import ChargerDetail from './pages/ChargerDetail';
import Sessions from './pages/Sessions';
import Logs from './pages/Logs';
import Login from './pages/Login';
import RfidTags from './pages/RfidTags';
import Settings from './pages/Settings';
import Accounts from './pages/Accounts';
import ChargeTrucks from './pages/ChargeTrucks';
import EnergyForward from './pages/EnergyForward';
import Billing from './pages/Billing';

function Layout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto' }}>{children}</main>
    </div>
  );
}

function PrivateRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function HomeRoute({ session }) {
  const profile = useProfile();
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role === 'driver') {
    return <Layout><DriverDashboard /></Layout>;
  }
  return <Layout><Dashboard /></Layout>;
}

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1117', color: '#8892a4' }}>
        Loading...
      </div>
    );
  }

  return (
    <ProfileProvider session={session}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/" element={<HomeRoute session={session} />} />
          <Route path="/charger/:id" element={<PrivateRoute session={session}><ChargerDetail /></PrivateRoute>} />
          <Route path="/sessions" element={<PrivateRoute session={session}><Sessions /></PrivateRoute>} />
          <Route path="/logs" element={<PrivateRoute session={session}><Logs /></PrivateRoute>} />
          <Route path="/rfid" element={<PrivateRoute session={session}><RfidTags /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute session={session}><Settings /></PrivateRoute>} />
          <Route path="/accounts" element={<PrivateRoute session={session}><Accounts /></PrivateRoute>} />
          <Route path="/charge-trucks" element={<PrivateRoute session={session}><ChargeTrucks /></PrivateRoute>} />
          <Route path="/energy-forward" element={<PrivateRoute session={session}><EnergyForward /></PrivateRoute>} />
          <Route path="/billing" element={<PrivateRoute session={session}><Billing /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ProfileProvider>
  );
}
