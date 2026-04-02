import { useState, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../hooks/useAuth';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname ?? '/overview';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {}
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">attendance_engine</div>
        <div className="login-sub">Admin Dashboard — sign in to continue</div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@college.edu" required autoFocus
            />
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={isLoading}>
            {isLoading ? 'signing in...' : 'sign in →'}
          </button>
          {/* Demo Credentials Box */}
          <div style={{ 
            marginTop: 24, 
            textAlign: 'center', 
            fontSize: 12, 
            color: 'var(--text3)', 
            fontFamily: 'var(--mono)' 
          }}>
            Demo: <span style={{ 
              background: 'var(--bg3)', 
              padding: '2px 6px', 
              borderRadius: 4, 
              color: 'var(--text2)' 
            }}>hod@vsbec.edu.in</span> / <span style={{ 
              background: 'var(--bg3)', 
              padding: '2px 6px', 
              borderRadius: 4, 
              color: 'var(--text2)' 
            }}>admin123</span>
          </div>
        </form>
      </div>
    </div>
  );
}
