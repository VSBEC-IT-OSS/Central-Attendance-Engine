import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from './hooks/useAuth';
import { LoginPage } from './pages/Login';
import { OverviewPage } from './pages/Overview';
import { ImportsPage } from './pages/Imports';
import { ImportDetailPage } from './pages/ImportDetail';
import { ParseErrorsPage } from './pages/ParseErrors';
import { ApiKeysPage } from './pages/ApiKeys';
import { SystemEventsPage } from './pages/SystemEvents';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <Topbar />
        <div className="page">{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrate().finally(() => setReady(true));
  }, [hydrate]);

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 13 }}>
        initialising...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={
        <AuthGuard>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/imports" element={<ImportsPage />} />
              <Route path="/imports/:id" element={<ImportDetailPage />} />
              <Route path="/parse-errors" element={<ParseErrorsPage />} />
              <Route path="/api-keys" element={<ApiKeysPage />} />
              <Route path="/events" element={<SystemEventsPage />} />
            </Routes>
          </AppLayout>
        </AuthGuard>
      } />
    </Routes>
  );
}
