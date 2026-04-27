import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

export default function Navigation() {
  const location = useLocation();

  const tabs = [
    { id: 'overview', path: '/', label: 'Dashboard', icon: 'Dashboard' },
    { id: 'traffic', path: '/traffic', label: 'Traffic', icon: 'Traffic', children: [
      { id: 'traffic.live', path: '/traffic/live', label: 'Live Traffic' },
      { id: 'traffic.table', path: '/traffic/table', label: 'Flow Table' },
      { id: 'traffic.pings', path: '/traffic/pings', label: 'Ping Results' },
      { id: 'traffic.analyzer', path: '/traffic/analyzer', label: 'Analyzer' },
      { id: 'traffic.attack', path: '/traffic/attack', label: 'Attack Traffic' },
      { id: 'traffic.history', path: '/traffic/history', label: 'History' },
      { id: 'traffic.filters', path: '/traffic/filters', label: 'Filters' },
    ] },
    { id: 'controller', path: '/controller', label: 'Controller', icon: 'Controller', children: [
      { id: 'controller.status', path: '/controller/status', label: 'Network Status' },
      { id: 'controller.switches', path: '/controller/switches', label: 'Switch & Host Monitoring' },
      { id: 'controller.flows', path: '/controller/flows', label: 'Flows' },
      { id: 'controller.traffic', path: '/controller/traffic', label: 'Traffic Control' },
      { id: 'controller.ids', path: '/controller/ids', label: 'IDS / Security' },
      { id: 'controller.logs', path: '/controller/logs', label: 'Logs & Performance' },
    ] },
    { id: 'ids', path: '/alerts', label: 'IDS Alerts', icon: 'IDS', children: [
      { id: 'ids.overview', path: '/alerts?section=overview', label: 'Overview' },
      { id: 'ids.list', path: '/alerts?section=list', label: 'Alert List' },
      { id: 'ids.details', path: '/alerts?section=details', label: 'Alert Details' },
      { id: 'ids.severity', path: '/alerts?section=severity', label: 'Severity Levels' },
      { id: 'ids.status', path: '/alerts?section=status', label: 'Status' },
      { id: 'ids.actions', path: '/alerts?section=actions', label: 'Actions' },
      { id: 'ids.filters', path: '/alerts?section=filters', label: 'Filters' },
      { id: 'ids.history', path: '/alerts?section=history', label: 'History' },
    ] }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Link to="/" className="text-decoration-none d-flex align-items-center">
          <i className="bi bi-shield-lock-fill me-2 fs-4" />
          <span className="brand-text">SDN Analysis</span>
        </Link>
      </div>
      <div className="sidebar-nav">
        {tabs.map(tab => {
          // active when current path starts with tab path (so subroutes still highlight)
          const isActive = tab.path === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.path);
          return (
            <div key={tab.id}>
              <Link to={tab.path} className={`sidebar-link ${isActive ? 'active' : ''}`}>
                <i className={`bi ${
                  tab.id === 'overview' ? 'bi-speedometer2' : tab.id === 'traffic' ? 'bi-graph-up' : tab.id === 'controller' ? 'bi-hdd-network' : 'bi-shield-exclamation'
                } me-2`} />
                <span className="d-flex align-items-center justify-content-between flex-grow-1 gap-2">
                  <span>{tab.label}</span>
                  {tab.badge ? <span className="traffic-count-badge">{tab.badge}</span> : null}
                </span>
              </Link>
              {tab.children && isActive ? (
                <div style={{ marginLeft: 18, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tab.children.map(child => (
                    <Link
                      key={child.id}
                      to={child.path}
                      className={`sidebar-link ${location.pathname + location.search === child.path || (child.path === '/traffic' && location.pathname === '/traffic') || (child.path === '/controller' && location.pathname === '/controller') ? 'active' : ''}`}
                      style={{ padding: '6px 10px', fontWeight: 500 }}
                    >
                      <span style={{ fontSize: 13 }}>{child.label}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
