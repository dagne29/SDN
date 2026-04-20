import React, { useEffect, useState, useRef } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, mininetAPI, trafficAPI } from '../services/api';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [mininetStatus, setMininetStatus] = useState(null);
  const [pingResult, setPingResult] = useState(null);
  const [trafficResult, setTrafficResult] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [pingSelection, setPingSelection] = useState({ src: 'h1', dst: 'h2' });
  const [trafficSelection, setTrafficSelection] = useState({ src: 'h1', dst: 'h3' });

  useEffect(() => {
    const load = async () => {
      try {
        const [dashboardRes, statusRes] = await Promise.all([
          dashboardAPI.getOverview(),
          mininetAPI.getStatus(),
        ]);
        setDashboardData(dashboardRes.data);
        // populate pingResult if backend provides a last-ping summary
        const lastPing = dashboardRes.data?.last_ping || dashboardRes.data?.last_ping_result || dashboardRes.data?.ping || dashboardRes.data?.last_ping_data || null;
        if (lastPing) setPingResult(lastPing);
        setMininetStatus(statusRes.data);

        const hosts = statusRes.data.hosts || [];
        if (hosts.length > 1) {
          setPingSelection({ src: hosts[0], dst: hosts[1] });
          setTrafficSelection({ src: hosts[0], dst: hosts[Math.min(2, hosts.length - 1)] });
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const refreshOverview = async () => {
    const response = await dashboardAPI.getOverview();
    setDashboardData(response.data);
    const lastPing = response.data?.last_ping || response.data?.last_ping_result || response.data?.ping || response.data?.last_ping_data || null;
    if (lastPing) setPingResult(lastPing);
  };

  const handlePingTest = async () => {
    try {
      const response = await trafficAPI.runPingTest(pingSelection.src, pingSelection.dst);
      setPingResult(response.data);
      setFeedback(`Ping ${pingSelection.src} to ${pingSelection.dst} completed.`);
      refreshOverview();
    } catch (error) {
      console.error('Error executing ping test:', error);
      setFeedback('Ping request failed.');
      setPingResult(null);
    }
  };

  const handleTrafficTest = async () => {
    try {
      const response = await trafficAPI.runTrafficTest(trafficSelection.src, trafficSelection.dst);
      setTrafficResult(response.data);
      setFeedback(`Traffic test ${trafficSelection.src} to ${trafficSelection.dst} completed.`);
      refreshOverview();
    } catch (error) {
      console.error('Error executing traffic test:', error);
      setFeedback('Traffic test failed.');
      setTrafficResult(null);
    }
  };

  const handleHostClick = (host) => {
    setPingSelection((prev) => ({ ...prev, src: host }));
    setTrafficSelection((prev) => ({ ...prev, src: host }));
    navigate(`/hosts/${host}`);
  };

  const pingCardRef = useRef(null);
  const [highlightPing, setHighlightPing] = useState(false);

  const handlePingSummaryClick = () => {
    if (!pingResult) return;
    // navigate to topology and also scroll/highlight the ping card here
    const src = pingResult.src_host || pingResult.src;
    const dst = pingResult.dst_host || pingResult.dst;
    if (src && dst) {
      navigate(`/topology?src=${encodeURIComponent(src)}&dst=${encodeURIComponent(dst)}`);
    }
    if (pingCardRef.current) {
      pingCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightPing(true);
      setTimeout(() => setHighlightPing(false), 2200);
    }
  };

  const handleFlowClick = (flow) => {
    navigate(`/flows/${flow.id}`);
  };

  const handleAlertClick = (alert) => {
    navigate(`/alerts/${alert.id}`);
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-spinner">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p>Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  const quickLinks = [
    { title: 'Topology', description: 'View hosts, switches, and links', destination: '/topology', badge: 'Map' },
    { title: 'Traffic', description: 'Inspect recent flow activity', destination: '/traffic', badge: 'Flows' },
    { title: 'Controller', description: 'Check controller and Mininet health', destination: '/controller', badge: 'Ryu' },
    { title: 'IDS Alerts', description: 'Review detections and blocks', destination: '/alerts', badge: 'Security' },
  ];

  return (
    <div className="dashboard-container">
      <div className="main-content">
        <div className="app-hero">
          <div className="hero-card glass-card card-accent">
            <div>
              <div className="hero-title">SDN IDS Dashboard</div>
              <div className="hero-subtitle">Realtime network view — controller, topology, traffic, and IDS alerts</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {pingResult ? (
              <div onClick={handlePingSummaryClick} role="button" tabIndex={0} className="ping-summary glass-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <i className={`bi ${pingResult.status && pingResult.status.toLowerCase().includes('success') ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-danger'}`} style={{ fontSize: 20 }} />
                <div style={{ lineHeight: 1 }}>
                  <div style={{ fontWeight: 600 }}>{pingResult.src_host} → {pingResult.dst_host}</div>
                  <div style={{ fontSize: 12, color: '#475569' }}>{pingResult.status} • {pingResult.round_trip_time || '—'}</div>
                </div>
              </div>
            ) : null}

            <button className="btn btn-outline-primary" onClick={refreshOverview}>
              <i className="bi bi-arrow-clockwise me-1" /> Refresh
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/topology')}>
              <i className="bi bi-map me-1" /> Topology
            </button>
          </div>
        </div>
        <div className="overview-section">
          <h2 className="section-title">Network Overview</h2>

          <div className="overview-actions">
            {quickLinks.map((action) => (
              <button
                type="button"
                key={action.title}
                className="action-card"
                onClick={() => navigate(action.destination)}
              >
                <div>
                  <h5>{action.title}</h5>
                  <p className="action-card-description">{action.description}</p>
                  <span className="badge bg-secondary">{action.badge}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <h3>Controller</h3>
              <div className="stat-value text-success">Online</div>
              <div className="stat-description">Ryu controller is reachable</div>
            </div>
            <div className="stat-card">
              <h3>Topology</h3>
              <div className="stat-value text-success">Active</div>
              <div className="stat-description">Mininet topology is running</div>
            </div>
            <div className="stat-card">
              <h3>Hosts</h3>
              <div className="stat-value">{dashboardData?.network_status?.hosts || 0}</div>
              <div className="stat-description">Connected hosts in Mininet</div>
            </div>
            <div className="stat-card">
              <h3>Switches</h3>
              <div className="stat-value">{dashboardData?.network_status?.switches || 0}</div>
              <div className="stat-description">Managed SDN switches</div>
            </div>
            <div className="stat-card">
              <h3>Traffic Load</h3>
              <div className="stat-value">{dashboardData?.network_load?.estimated_mbps || 0} Mbps</div>
              <div className="stat-description">Recent throughput estimate</div>
            </div>
            <div className="stat-card">
              <h3>Alerts</h3>
              <div className="stat-value">{dashboardData?.network_status?.alerts || 0}</div>
              <div className="stat-description">Current IDS detections</div>
            </div>
            <div className="stat-card">
              <h3>Packet Loss</h3>
              <div className="stat-value">{dashboardData?.network_load?.packet_loss || 'N/A'}</div>
              <div className="stat-description">Latest Mininet estimate</div>
            </div>
            <div className="stat-card">
              <h3>Health</h3>
              <div className="stat-value text-success">{dashboardData?.system_health || 'good'}</div>
              <div className="stat-description">Overall network condition</div>
            </div>
          </div>

          <div className="control-panel">
            <h3>Mininet Control Panel</h3>
            {feedback ? <div className="alert alert-info py-2">{feedback}</div> : null}

            <div className="row g-4">
              <div className="col-12 col-xl-7">
                <div className="card h-100">
                  <div className="card-header">
                    <h5>Traffic Commands</h5>
                  </div>
                  <div className="card-body">
                    <div className="command-stack">
                      <div className="command-row">
                        <label className="form-label">Ping Test</label>
                        <div className="command-grid">
                          <select
                            className="form-select"
                            value={pingSelection.src}
                            onChange={(event) => setPingSelection((prev) => ({ ...prev, src: event.target.value }))}
                          >
                            {mininetStatus?.hosts?.map((host) => (
                              <option key={host} value={host}>{host}</option>
                            ))}
                          </select>
                          <select
                            className="form-select"
                            value={pingSelection.dst}
                            onChange={(event) => setPingSelection((prev) => ({ ...prev, dst: event.target.value }))}
                          >
                            {mininetStatus?.hosts?.map((host) => (
                              <option key={host} value={host}>{host}</option>
                            ))}
                          </select>
                          <button className="btn btn-primary" onClick={handlePingTest}>
                            Ping
                          </button>
                        </div>
                      </div>

                      <div className="command-row">
                        <label className="form-label">Traffic Test</label>
                        <div className="command-grid">
                          <select
                            className="form-select"
                            value={trafficSelection.src}
                            onChange={(event) => setTrafficSelection((prev) => ({ ...prev, src: event.target.value }))}
                          >
                            {mininetStatus?.hosts?.map((host) => (
                              <option key={host} value={host}>{host}</option>
                            ))}
                          </select>
                          <select
                            className="form-select"
                            value={trafficSelection.dst}
                            onChange={(event) => setTrafficSelection((prev) => ({ ...prev, dst: event.target.value }))}
                          >
                            {mininetStatus?.hosts?.map((host) => (
                              <option key={host} value={host}>{host}</option>
                            ))}
                          </select>
                          <button className="btn btn-success" onClick={handleTrafficTest}>
                            Run Iperf
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-xl-5">
                <div className="card h-100">
                  <div className="card-header">
                    <h5>Controller Snapshot</h5>
                  </div>
                  <div className="card-body status-panel">
                    <div className="status-row">
                      <strong>Topology</strong>
                      <span className={`badge ${mininetStatus?.topology_running ? 'bg-success' : 'bg-danger'}`}>
                        {mininetStatus?.topology_running ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                    <div className="status-row">
                      <strong>Controller</strong>
                      <span className={`badge ${mininetStatus?.controller_connected ? 'bg-success' : 'bg-danger'}`}>
                        {mininetStatus?.controller_connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    <div className="status-row">
                      <strong>Hosts</strong>
                      <span>{mininetStatus?.hosts?.length || 0}</span>
                    </div>
                    <div className="status-row">
                      <strong>Switches</strong>
                      <span>{mininetStatus?.switches?.length || 0}</span>
                    </div>
                    <div className="status-row status-list">
                      <strong>Live Hosts</strong>
                      <div className="badge-wrap">
                        {mininetStatus?.hosts?.map((host) => (
                          <button
                            key={host}
                            type="button"
                            className="badge bg-secondary"
                            onClick={() => handleHostClick(host)}
                            aria-label={`View ${host} details`}
                            style={{ cursor: 'pointer', marginRight: 6 }}
                          >
                            {host}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row mt-4 g-4">
            <div className="col-12 col-xl-6">
                <div ref={pingCardRef} id="last-ping-card" className={`card result-card h-100 ${highlightPing ? 'highlight-pulse' : ''}`}>
                <div className="card-header">
                  <h5>Last Ping Result</h5>
                </div>
                <div className="card-body">
                  {pingResult ? (
                    <div className="result-content">
                      <p className="mb-2">
                        <span className="badge bg-primary me-2">{pingResult.status}</span>
                        <strong>{pingResult.command}</strong>
                        {pingResult.flow_id ? (
                          <button
                            type="button"
                            className="btn btn-link btn-sm ms-2"
                            onClick={() => handleFlowClick({ id: pingResult.flow_id })}
                          >
                            View Flow
                          </button>
                        ) : null}
                      </p>
                      <table className="table table-borderless table-sm">
                        <tbody>
                          <tr><th>Source</th><td>{pingResult.src_host} ({pingResult.src_ip})</td></tr>
                          <tr><th>Source MAC</th><td>{pingResult.src_mac || '—'}</td></tr>
                          <tr><th>Destination</th><td>{pingResult.dst_host} ({pingResult.dst_ip})</td></tr>
                          <tr><th>Destination MAC</th><td>{pingResult.dst_mac || '—'}</td></tr>
                          <tr><th>Protocol</th><td>{pingResult.protocol}</td></tr>
                          <tr><th>Round Trip</th><td>{pingResult.round_trip_time || '—'}</td></tr>
                          <tr><th>Timestamp</th><td>{pingResult.timestamp || pingResult.time || '—'}</td></tr>
                          <tr><th>Severity</th><td>{(() => {
                            const sev = pingResult.generated_alerts?.reduce((acc, a) => Math.max(acc, a?.severity || 0), 0) || 0;
                            if (sev >= 8) return 'Critical';
                            if (sev >= 5) return 'High';
                            if (sev >= 3) return 'Medium';
                            if (sev > 0) return 'Low';
                            return 'None';
                          })()}</td></tr>
                          <tr><th>Attacker</th><td>{(pingResult.generated_alerts?.some(a => (a?.type || '').toLowerCase().includes('attack') || (a?.severity || 0) >= 5)) ? 'Yes' : 'No'}</td></tr>
                          <tr>
                            <th>IDS Triggered</th>
                            <td>
                              {pingResult.generated_alerts?.length ? (
                                <div>
                                  <span>{`${pingResult.generated_alerts.length} alert(s)`}</span>
                                  <ul className="mt-2 mb-0">
                                    {pingResult.generated_alerts.map((a) => (
                                      <li key={a.id} style={{ listStyle: 'none', padding: 0 }}>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-danger me-2"
                                          onClick={() => handleAlertClick(a)}
                                        >
                                          {a.type}
                                        </button>
                                        <small className="text-muted">{a.reason || a.timestamp}</small>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                'No alert'
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-muted mb-0">No ping request has been executed yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="col-12 col-xl-6">
              <div className="card result-card h-100">
                <div className="card-header">
                  <h5>Last Traffic Test</h5>
                </div>
                <div className="card-body">
                  {trafficResult ? (
                    <div className="result-content">
                      <table className="table table-borderless table-sm">
                        <tbody>
                          <tr>
                            <th>Command</th>
                            <td>
                              {trafficResult.command}
                              {trafficResult.flow_id ? (
                                <button
                                  type="button"
                                  className="btn btn-link btn-sm ms-2"
                                  onClick={() => handleFlowClick({ id: trafficResult.flow_id })}
                                >
                                  View Flow
                                </button>
                              ) : null}
                            </td>
                          </tr>
                          <tr><th>Source</th><td>{trafficResult.src_host} ({trafficResult.src_ip})</td></tr>
                          <tr><th>Destination</th><td>{trafficResult.dst_host} ({trafficResult.dst_ip})</td></tr>
                          <tr><th>Bandwidth</th><td>{trafficResult.bandwidth}</td></tr>
                          <tr><th>Packet Loss</th><td>{trafficResult.packet_loss}</td></tr>
                          <tr>
                            <th>IDS Triggered</th>
                            <td>
                              {trafficResult.generated_alerts?.length ? (
                                <div>
                                  <span>{`${trafficResult.generated_alerts.length} alert(s)`}</span>
                                  <ul className="mt-2 mb-0">
                                    {trafficResult.generated_alerts.map((a) => (
                                      <li key={a.id} style={{ listStyle: 'none', padding: 0 }}>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-danger me-2"
                                          onClick={() => handleAlertClick(a)}
                                        >
                                          {a.type}
                                        </button>
                                        <small className="text-muted">{a.reason || a.timestamp}</small>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                'No alert'
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-muted mb-0">No traffic test has been executed yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="row mt-4 g-4">
            <div className="col-12 col-xl-6">
              <div className="card h-100">
                <div className="card-header">
                  <h5>Recent Ping Activity</h5>
                </div>
                <div className="card-body">
                  {dashboardData?.recent_ping_traffic?.length ? (
                    <div className="list-group list-group-flush">
                      {dashboardData.recent_ping_traffic.slice().reverse().slice(0, 5).map((flow) => (
                        <div
                          key={flow.id}
                          className="list-group-item list-group-item-action"
                          onClick={() => handleFlowClick(flow)}
                          role="button"
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="d-flex justify-content-between gap-3">
                            <small className="text-muted">
                              <strong>{flow.src_host}</strong> → <strong>{flow.dst_host}</strong>
                              {' '}| {flow.protocol}
                              {' '}| {flow.packets} packets
                              {' '}| {flow.bytes} bytes
                            </small>
                            <small className="text-muted">{flow.timestamp}</small>
                          </div>
                          <div className="d-flex justify-content-between gap-3 mt-1">
                            <small className="text-muted">Flow ID: <code>{flow.id}</code></small>
                            <span className={`badge ${flow.status === 'active' ? 'bg-success' : 'bg-danger'}`}>
                              {flow.status || 'active'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted mb-0">No recent ping activity.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="col-12 col-xl-6">
              <div className="card h-100">
                <div className="card-header">
                  <h5>Active Alerts</h5>
                </div>
                <div className="card-body">
                  {dashboardData?.active_alerts?.length ? (
                    <div className="list-group list-group-flush">
                      {dashboardData.active_alerts.slice().reverse().map((alert) => (
                        <div
                          key={alert.id}
                          className="list-group-item list-group-item-danger list-group-item-action"
                          onClick={() => handleAlertClick(alert)}
                          role="button"
                          style={{ cursor: 'pointer' }}
                        >
                          <small>
                            <strong>{alert.type}</strong> from {alert.source_host} to {alert.destination_host}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted mb-0">No active alerts.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
