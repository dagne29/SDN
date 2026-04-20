import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { dashboardAPI } from '../services/api';
import './Navigation.css';

export default function Navigation() {
  const location = useLocation();
  const [recentPingFlows, setRecentPingFlows] = useState([]);

  const loadPingActivity = async () => {
    try {
      const response = await dashboardAPI.getOverview();
      const pingFlows = response.data?.recent_ping_traffic || [];
      setRecentPingFlows(pingFlows.slice().reverse().slice(0, 4));
    } catch (error) {
      console.error('Error loading ping activity:', error);
    }
  };

  useEffect(() => {
    loadPingActivity();
    const interval = setInterval(loadPingActivity, 5000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: 'overview', path: '/', label: 'Dashboard', icon: 'Dashboard' },
    { id: 'topology', path: '/topology', label: 'Topology', icon: 'Topology' },
    { id: 'traffic', path: '/traffic', label: 'Traffic', icon: 'Traffic', badge: recentPingFlows.length, children: [
      { id: 'traffic.overview', path: '/traffic', label: 'Overview' },
      { id: 'traffic.live', path: '/traffic/live', label: 'Live Traffic' },
      { id: 'traffic.table', path: '/traffic/table', label: 'Flow Table' },
      { id: 'traffic.pings', path: '/traffic/pings', label: 'Ping Results' },
      { id: 'traffic.analyzer', path: '/traffic/analyzer', label: 'Analyzer' },
      { id: 'traffic.attack', path: '/traffic/attack', label: 'Attack Traffic' },
      { id: 'traffic.history', path: '/traffic/history', label: 'History' },
      { id: 'traffic.filters', path: '/traffic/filters', label: 'Filters' },
    ] },
    { id: 'controller', path: '/controller', label: 'Controller', icon: 'Controller', children: [
      { id: 'controller.overview', path: '/controller', label: 'Overview' },
      { id: 'controller.status', path: '/controller/status', label: 'Network Status' },
      { id: 'controller.switches', path: '/controller/switches', label: 'Switch & Host Monitoring' },
      { id: 'controller.flows', path: '/controller/flows', label: 'Flows' },
      { id: 'controller.traffic', path: '/controller/traffic', label: 'Traffic Control' },
      { id: 'controller.ids', path: '/controller/ids', label: 'IDS / Security' },
      { id: 'controller.logs', path: '/controller/logs', label: 'Logs & Performance' },
    ] },
    { id: 'ids', path: '/alerts', label: 'IDS Alerts', icon: 'IDS' }
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
                  tab.id === 'overview' ? 'bi-speedometer2' : tab.id === 'topology' ? 'bi-map' : tab.id === 'traffic' ? 'bi-graph-up' : tab.id === 'controller' ? 'bi-hdd-network' : 'bi-shield-exclamation'
                } me-2`} />
                <span className="d-flex align-items-center justify-content-between flex-grow-1 gap-2">
                  <span>{tab.label}</span>
                  {tab.badge ? <span className="traffic-count-badge">{tab.badge}</span> : null}
                </span>
              </Link>
              {tab.id === 'traffic' && isActive ? (
                <div className="traffic-activity-panel">
                  <div className="traffic-activity-title">Recent ping activity</div>
                  {recentPingFlows.length > 0 ? (
                    recentPingFlows.map((flow) => (
                      <div key={flow.id} className="traffic-activity-item">
                        <div className="traffic-activity-route">
                          {flow.src_host || flow.src_ip} <span>→</span> {flow.dst_host || flow.dst_ip}
                        </div>
                        <div className="traffic-activity-meta">
                          <span>{flow.protocol || 'ICMP'}</span>
                          <span>{flow.status || 'active'}</span>
                        </div>
                        <div className="traffic-activity-meta">
                          <span>{flow.packets} pkts | {flow.bytes} bytes</span>
                          <span>{flow.latency_ms ? `${flow.latency_ms} ms` : '—'}</span>
                        </div>
                        {flow.output ? (
                          <div className="traffic-activity-meta">
                            <span style={{ whiteSpace: 'normal' }}>{flow.output}</span>
                          </div>
                        ) : null}
                        <div className="traffic-activity-meta">
                          <span><code>{flow.id}</code></span>
                          <span>{flow.timestamp}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="traffic-activity-empty">No ping requests yet.</div>
                  )}
                </div>
              ) : null}
              {tab.children && isActive ? (
                <div style={{ marginLeft: 18, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tab.children.map(child => (
                    <Link
                      key={child.id}
                      to={child.path}
                      className={`sidebar-link ${location.pathname === child.path ? 'active' : ''}`}
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
