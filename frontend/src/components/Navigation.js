import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

export default function Navigation() {
  const location = useLocation();

  const tabs = [
    { id: 'overview', path: '/', label: 'Dashboard', icon: 'Dashboard' },
    { id: 'topology', path: '/topology', label: 'Topology', icon: 'Topology' },
    { id: 'traffic', path: '/traffic', label: 'Traffic', icon: 'Traffic' },
    { id: 'controller', path: '/controller', label: 'Controller', icon: 'Controller' },
    { id: 'ids', path: '/alerts', label: 'IDS Alerts', icon: 'IDS' }
  ];

  return (
    <nav className="navbar navbar-dark bg-dark">
      <div className="container-fluid">
        <Link to="/" className="navbar-brand mb-0 h1 text-decoration-none">
          SDN Network Analysis & IDS
        </Link>
        <div className="nav-tabs">
          {tabs.map(tab => (
            <Link
              key={tab.id}
              to={tab.path}
              className={`nav-btn ${location.pathname === tab.path ? 'active' : ''}`}
            >
              {tab.icon} {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
