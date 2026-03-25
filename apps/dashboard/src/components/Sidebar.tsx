import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../hooks/useAuth';

const NAV = [
  { section: 'Monitor' },
  { label: 'Overview', path: '/overview' },
  { label: 'System Events', path: '/events' },
  { section: 'Ingest' },
  { label: 'Import Logs', path: '/imports' },
  { label: 'Parse Errors', path: '/parse-errors' },
  { section: 'Security' },
  { label: 'API Keys', path: '/api-keys' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        attendance<span>_</span>engine
      </div>
      <nav className="sidebar-nav">
        {NAV.map((item, i) =>
          'section' in item ? (
            <div key={i} className="nav-section">{item.section}</div>
          ) : (
            <div
              key={item.path}
              className={`nav-item ${pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path!)}
            >
              <span className="nav-dot" />
              {item.label}
            </div>
          ),
        )}
      </nav>
      <div className="sidebar-footer">
        <strong>{user?.name ?? '—'}</strong>
        {user?.email}
        <div style={{ marginTop: 8 }}>
          <span
            style={{ cursor: 'pointer', color: 'var(--red)', fontSize: 12 }}
            onClick={logout}
          >
            sign out
          </span>
        </div>
      </div>
    </div>
  );
}
