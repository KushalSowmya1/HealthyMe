import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', short: 'DB' },
  { label: 'Predict', path: '/predict', short: 'PR' },
  { label: 'History', path: '/history', short: 'HI' },
  { label: 'Chat', path: '/chat', short: 'CH' },
];

export default function AppShell({ title, subtitle, children, actions }) {
  const navigate = useNavigate();
  const location = useLocation();
  const storedUser = localStorage.getItem('user');
  const user = storedUser ? JSON.parse(storedUser) : null;
  const profile = user?.profile || {};

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <div className="product-layout">
        <aside className="side-rail">
          <div className="rail-brand">
            <span className="brand-badge">HM</span>
            <div>
              <strong>HealthyMe Pro</strong>
              <span>Health companion</span>
            </div>
          </div>

          <div className="rail-section">
            {navItems.map((item) => (
              <button
                key={item.path}
                type="button"
                className={`rail-link ${location.pathname === item.path ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span className="rail-icon">{item.short}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="rail-card">
            <p>Hydration target</p>
            <strong>{profile.daily_water_goal || '3'}L / day</strong>
            <span>{profile.food_preference || 'Balanced'} food plan</span>
          </div>

          <div className="rail-user">
            <span>Signed in as</span>
            <strong>{user?.name || 'User'}</strong>
            <button type="button" className="ghost-btn" onClick={logout}>
              Sign out
            </button>
          </div>
        </aside>

        <div className="main-shell">
          <header className="topbar">
            <div className="page-heading compact">
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="topbar-right">
              <div className="top-pill">Goal: {profile.goal || 'Stay Fit'}</div>
              {actions || null}
            </div>
          </header>

          <main className="page-content advanced-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
