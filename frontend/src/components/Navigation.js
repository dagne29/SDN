import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';
import { mininetAPI, controllerAPI } from '../services/api';

function StatusDot({ online }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: online ? '#22c55e' : '#ef4444',
        boxShadow: online ? '0 0 0 2px rgba(34,197,94,0.25)' : '0 0 0 2px rgba(239,68,68,0.25)',
        flexShrink: 0,
        animation: online ? 'blink 2s infinite' : 'none',
      }}
    />
  );
}

export default function Navigation() {
  const location = useLocation();

  // Connection status state
  const [mininetOnline, setMininetOnline] = useState(null); // null = checking
  const [controllerOnline, setControllerOnline] = useState(null);

  useEffect(() => {
    const check = async () => {
      // Check Mininet / Topology status
      try {
        const res = await mininetAPI.getStatus();
        const data = res?.data;
        const connected =
          data?.connected === true ||
          data?.status === 'connected' ||
          data?.status === 'running' ||
          (Array.isArray(data?.hosts) && data.hosts.length > 0) ||
          (Array.isArray(data?.switches) && data.switches.length > 0);
        setMininetOnline(connected);
      } catch {
        setMininetOnline(false);
      }

      // Check Ryu Controller status
      try {
        const res = await controllerAPI.getStatus();
        const data = res?.data;
        const connected =
          data?.connected === true ||
          data?.status === 'connected' ||
          data?.status === 'running' ||
          (Array.isArray(data?.switches) && data.switches.length > 0);
        setControllerOnline(connected);
      } catch {
        setControllerOnline(false);
      }
    };

    check();
    const interval = setInterval(check, 8000);
    return () => clearInterval(interval);
  }, []);

  const statusLabel = (online) => {
    if (online === null) return 'Checking…';
    return online ? 'Online' : 'Offline';
  };

  const tabs = [
    { id: 'overview', path: '/', label: 'Dashboard', icon: 'bi-speedometer2' },
    {
      id: 'traffic', path: '/traffic', label: 'Traffic', icon: 'bi-graph-up',
      children: [
        { id: 'traffic.live',     path: '/traffic/live',     label: 'Live Traffic' },
        { id: 'traffic.table',    path: '/traffic/table',    label: 'Flow Table' },
        { id: 'traffic.pings',    path: '/traffic/pings',    label: 'Ping Results' },
        { id: 'traffic.analyzer', path: '/traffic/analyzer', label: 'Analyzer' },
        { id: 'traffic.attack',   path: '/traffic/attack',   label: 'Attack Traffic' },
        { id: 'traffic.history',  path: '/traffic/history',  label: 'History' },
        { id: 'traffic.filters',  path: '/traffic/filters',  label: 'Filters' },
      ]
    },
    {
      id: 'topology', path: '/topology', label: 'Topology', icon: 'bi-diagram-3',
      statusKey: 'mininet',
    },
    {
      id: 'controller', path: '/controller', label: 'Controller', icon: 'bi-hdd-network',
      statusKey: 'controller',
      children: [
        { id: 'controller.status',   path: '/controller/status',   label: 'Network Status' },
        { id: 'controller.switches', path: '/controller/switches', label: 'Switch & Host Monitoring' },
        { id: 'controller.flows',    path: '/controller/flows',    label: 'Flows' },
      ]
    },
    {
      id: 'ids', path: '/alerts', label: 'IDS Alerts', icon: 'bi-shield-exclamation',
      children: [
        { id: 'ids.overview', path: '/alerts?section=overview', label: 'Overview' },
        { id: 'ids.list',     path: '/alerts?section=list',     label: 'Alert List' },
        { id: 'ids.severity', path: '/alerts?section=severity', label: 'Severity Levels' },
        { id: 'ids.status',   path: '/alerts?section=status',   label: 'Status' },
        { id: 'ids.filters',  path: '/alerts?section=filters',  label: 'Filters' },
        { id: 'ids.history',  path: '/alerts?section=history',  label: 'History' },
      ]
    },
  ];

  const statusMap = {
    mininet: mininetOnline,
    controller: controllerOnline,
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Link to="/" className="text-decoration-none d-flex align-items-center">
          <i className="bi bi-shield-lock-fill me-2 fs-4" />
          <span className="brand-text">SDN Analysis</span>
        </Link>
      </div>

      {/* Connection status banner */}
      <div className="sidebar-status-panel">
        <div className="sidebar-status-row">
          <StatusDot online={mininetOnline} />
          <span className="sidebar-status-label">Mininet</span>
          <span className={`sidebar-status-badge ${mininetOnline ? 'online' : mininetOnline === false ? 'offline' : 'checking'}`}>
            {statusLabel(mininetOnline)}
          </span>
        </div>
        <div className="sidebar-status-row">
          <StatusDot online={controllerOnline} />
          <span className="sidebar-status-label">Ryu Controller</span>
          <span className={`sidebar-status-badge ${controllerOnline ? 'online' : controllerOnline === false ? 'offline' : 'checking'}`}>
            {statusLabel(controllerOnline)}
          </span>
        </div>
      </div>

      <div className="sidebar-nav">
        {tabs.map(tab => {
          const isActive = tab.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(tab.path);
          const tabStatus = tab.statusKey != null ? statusMap[tab.statusKey] : undefined;

          return (
            <div key={tab.id}>
              <Link to={tab.path} className={`sidebar-link ${isActive ? 'active' : ''}`}>
                <i className={`bi ${tab.icon} me-2`} />
                <span className="d-flex align-items-center justify-content-between flex-grow-1 gap-2">
                  <span>{tab.label}</span>
                  <span className="d-flex align-items-center gap-1">
                    {tab.badge ? <span className="traffic-count-badge">{tab.badge}</span> : null}
                    {/* Inline status indicator for Topology and Controller */}
                    {tabStatus !== undefined && (
                      <span
                        className={`sidebar-inline-status ${tabStatus ? 'online' : tabStatus === false ? 'offline' : 'checking'}`}
                        title={`${tab.label}: ${statusLabel(tabStatus)}`}
                      >
                        <StatusDot online={tabStatus} />
                        <span style={{ fontSize: 10, marginLeft: 3 }}>
                          {statusLabel(tabStatus)}
                        </span>
                      </span>
                    )}
                  </span>
                </span>
              </Link>
              {tab.children && isActive ? (
                <div style={{ marginLeft: 18, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tab.children.map(child => (
                    <Link
                      key={child.id}
                      to={child.path}
                      className={`sidebar-link ${
                        location.pathname + location.search === child.path ||
                        (child.path === '/traffic' && location.pathname === '/traffic') ||
                        (child.path === '/controller' && location.pathname === '/controller')
                          ? 'active' : ''
                      }`}
                      style={{ padding: '6px 10px', fontWeight: 500 }}
                    >
                      <span style={{ fontSize: 13 }}>{child.label}</span>
                      {/* Analyzer badge */}
                      {child.id === 'traffic.analyzer' && (
                        <span className="badge ms-auto" style={{ fontSize: 9, background: '#22c55e', color: '#fff', padding: '2px 6px' }}>
                          Best
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .sidebar-status-panel {
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          padding: 8px 10px;
          margin-bottom: 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sidebar-status-row {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .sidebar-status-label {
          font-size: 11px;
          color: rgba(255,255,255,0.7);
          flex: 1;
        }
        .sidebar-status-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 999px;
          letter-spacing: 0.3px;
        }
        .sidebar-status-badge.online {
          background: rgba(34,197,94,0.18);
          color: #4ade80;
        }
        .sidebar-status-badge.offline {
          background: rgba(239,68,68,0.18);
          color: #f87171;
        }
        .sidebar-status-badge.checking {
          background: rgba(148,163,184,0.15);
          color: #94a3b8;
        }
        .sidebar-inline-status {
          display: inline-flex;
          align-items: center;
          padding: 2px 6px;
          border-radius: 999px;
          font-weight: 600;
        }
        .sidebar-inline-status.online {
          background: rgba(34,197,94,0.15);
          color: #4ade80;
        }
        .sidebar-inline-status.offline {
          background: rgba(239,68,68,0.15);
          color: #f87171;
        }
        .sidebar-inline-status.checking {
          background: rgba(148,163,184,0.1);
          color: #94a3b8;
        }
      `}</style>
    </aside>
  );
}