import React, { useEffect, useState, useRef } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, mininetAPI, pingAPI, trafficAPI } from '../services/api';
import { appendPingHistory, clearPingHistory, formatPingTimelineTime, getPingKey, getPingSequence, getPingTimeMs, normalizePingEntry, readPingHistory } from '../services/pingHistory';
import './Dashboard.css';

export default function Dashboard() {
  const [showClearBtn, setShowClearBtn] = useState(true);
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [mininetStatus, setMininetStatus] = useState(null);
  const [pingResult, setPingResult] = useState(null);
  const [pingHistory, setPingHistory] = useState(() => readPingHistory());
  const [recentPingEvents, setRecentPingEvents] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [pingSelection, setPingSelection] = useState({ src: 'user1', dst: 'mail_srv' });
  const [lastPingClearedAt, setLastPingClearedAt] = useState(() => {
    try {
      const raw = window?.localStorage?.getItem('sdn_last_ping_cleared_at_v1');
      const value = raw ? Number(raw) : 0;
      return Number.isFinite(value) ? value : 0;
    } catch (e) {
      return 0;
    }
  });
  const [lastPingClearedAfterId, setLastPingClearedAfterId] = useState(() => {
    try {
      return window?.localStorage?.getItem('sdn_last_ping_cleared_after_id_v1') || '';
    } catch (e) {
      return '';
    }
  });
  const [recentPingListClearedAt, setRecentPingListClearedAt] = useState(() => {
    try {
      const raw = window?.localStorage?.getItem('sdn_dashboard_recent_pings_cleared_at_v1');
      const value = raw ? Number(raw) : 0;
      return Number.isFinite(value) ? value : 0;
    } catch (e) {
      return 0;
    }
  });
  const [recentPingListClearedAfterId, setRecentPingListClearedAfterId] = useState(() => {
    try {
      return window?.localStorage?.getItem('sdn_dashboard_recent_pings_cleared_after_id_v1') || '';
    } catch (e) {
      return '';
    }
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [dashboardRes, statusRes] = await Promise.all([
          dashboardAPI.getOverview(),
          mininetAPI.getStatus(),
        ]);
        setDashboardData(dashboardRes.data);
        const [latestPingRes, recentPingRes] = await Promise.all([
          pingAPI.getLatest(),
          pingAPI.getAll({ limit: 10 }),
        ]);
        const latestPing = latestPingRes.data && Object.keys(latestPingRes.data).length ? latestPingRes.data : null;
        const lastPingCandidate = latestPing || dashboardRes.data?.last_ping || dashboardRes.data?.last_ping_result || dashboardRes.data?.last_ping_flow || null;
        const lastKey = (lastPingCandidate?.id || lastPingCandidate?.flow_id || '').toString();
        const lastSeq = getPingSequence(lastPingCandidate);
        const clearedSeq = lastPingClearedAfterId ? getPingSequence({ id: lastPingClearedAfterId }) : null;
        const lastPingTime = Date.parse(lastPingCandidate?.timestamp || lastPingCandidate?.time || '') || 0;
        const lastPing =
          lastPingCandidate &&
          (lastPingClearedAfterId
            ? (lastSeq != null && clearedSeq != null ? lastSeq > clearedSeq : (lastKey ? lastKey !== lastPingClearedAfterId : lastPingTime > lastPingClearedAt))
            : lastPingTime > lastPingClearedAt)
            ? lastPingCandidate
            : null;
        setPingResult((prev) => {
          const prevKey = getPingKey(prev);
          const nextKey = getPingKey(lastPing);
          if (prevKey && nextKey && prevKey === nextKey) return prev;
          if (lastPing && Object.keys(lastPing).length) return lastPing;
          return null;
        });
        const recentEvents = recentPingRes.data || dashboardRes.data?.recent_ping_traffic || [];
        const visibleRecentEvents = recentEvents.filter((item) => {
          if (recentPingListClearedAfterId) {
            const seq = getPingSequence(item);
            const cleared = getPingSequence({ id: recentPingListClearedAfterId });
            if (seq != null && cleared != null) return seq > cleared;
            const key = (item?.id || item?.flow_id || '').toString();
            if (key) return key !== recentPingListClearedAfterId;
          }
          const t = Date.parse(item?.timestamp || item?.time || '') || 0;
          return t > recentPingListClearedAt;
        });
        setRecentPingEvents(visibleRecentEvents);
        if (recentEvents?.length) {
          const nextHistory = appendPingHistory(recentEvents);
          setPingHistory(nextHistory);
        }
        setMininetStatus(statusRes.data);

        const hosts = statusRes.data.hosts || [];
        if (hosts.length > 1) {
          setPingSelection({ src: hosts[0], dst: hosts[1] });
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

  useEffect(() => {
    if (!pingResult) return undefined;
    const entry = normalizePingEntry(pingResult);
    if (entry) {
      const nextHistory = appendPingHistory(entry, { max: 200 });
      setPingHistory(nextHistory);
    }
    return undefined;
  }, [pingResult]);

  const refreshOverview = async () => {
    const response = await dashboardAPI.getOverview();
    setDashboardData(response.data);
    const [latestPingRes, recentPingRes] = await Promise.all([
      pingAPI.getLatest(),
      pingAPI.getAll({ limit: 10 }),
    ]);
    const latestPing = latestPingRes.data && Object.keys(latestPingRes.data).length ? latestPingRes.data : null;
    const lastPingCandidate = latestPing || response.data?.last_ping || response.data?.last_ping_result || response.data?.last_ping_flow || null;
    const lastKey = (lastPingCandidate?.id || lastPingCandidate?.flow_id || '').toString();
    const lastSeq = getPingSequence(lastPingCandidate);
    const clearedSeq = lastPingClearedAfterId ? getPingSequence({ id: lastPingClearedAfterId }) : null;
    const lastPingTime = Date.parse(lastPingCandidate?.timestamp || lastPingCandidate?.time || '') || 0;
    const lastPing =
      lastPingCandidate &&
      (lastPingClearedAfterId
        ? (lastSeq != null && clearedSeq != null ? lastSeq > clearedSeq : (lastKey ? lastKey !== lastPingClearedAfterId : lastPingTime > lastPingClearedAt))
        : lastPingTime > lastPingClearedAt)
        ? lastPingCandidate
        : null;
    setPingResult((prev) => {
      const prevKey = getPingKey(prev);
      const nextKey = getPingKey(lastPing);
      if (prevKey && nextKey && prevKey === nextKey) return prev;
      if (lastPing && Object.keys(lastPing).length) return lastPing;
      return null;
    });
    const recentEvents = recentPingRes.data || response.data?.recent_ping_traffic || [];
    const visibleRecentEvents = recentEvents.filter((item) => {
      if (recentPingListClearedAfterId) {
        const seq = getPingSequence(item);
        const cleared = getPingSequence({ id: recentPingListClearedAfterId });
        if (seq != null && cleared != null) return seq > cleared;
        const key = (item?.id || item?.flow_id || '').toString();
        if (key) return key !== recentPingListClearedAfterId;
      }
      const t = getPingTimeMs(item);
      return t > recentPingListClearedAt;
    });
    setRecentPingEvents(visibleRecentEvents);
    if (recentEvents?.length) {
      const nextHistory = appendPingHistory(recentEvents);
      setPingHistory(nextHistory);
    }
  };

  const handlePingTest = async () => {
    try {
      const response = await trafficAPI.runPingTest(pingSelection.src, pingSelection.dst);
      const pingResponse = response.data || {};
      setPingResult({
        ...pingResponse,
        src_host: pingResponse.src_host || pingSelection.src,
        dst_host: pingResponse.dst_host || pingSelection.dst,
      });
      setFeedback(`Ping ${pingSelection.src} to ${pingSelection.dst} completed.`);
      await refreshOverview();
    } catch (error) {
      console.error('Error executing ping test:', error);
      setFeedback('Ping request failed.');
      setPingResult(null);
    }
  };

  const handleHostClick = (host) => {
    setPingSelection((prev) => ({ ...prev, src: host }));
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

  const handleClearPingActivity = async () => {
    try {
      await pingAPI.clearAll({ includeFlows: true });
      clearPingHistory();
      setPingHistory([]);
      setRecentPingEvents([]);
      setRecentPingListClearedAt(0);
      setRecentPingListClearedAfterId('');
      setPingResult(null);
      setFeedback('Recent ping activity deleted.');
      try {
        window.localStorage?.removeItem('sdn_dashboard_recent_pings_cleared_at_v1');
        window.localStorage?.removeItem('sdn_dashboard_recent_pings_cleared_after_id_v1');
        window.localStorage?.removeItem('sdn_last_ping_cleared_at_v1');
        window.localStorage?.removeItem('sdn_last_ping_cleared_after_id_v1');
      } catch (e) {
        // ignore
      }
      await refreshOverview();
    } catch (e) {
      console.error('Failed to clear recent ping activity:', e);
      setFeedback('Failed to delete recent ping activity.');
    }
  };

  const handleClearLastPing = () => {
    const clearedAt = Date.now();
    setLastPingClearedAt(clearedAt);
    try {
      window.localStorage?.setItem('sdn_last_ping_cleared_at_v1', String(clearedAt));
    } catch (e) {
      // ignore
    }
    try {
      const key = getPingKey(pingResult);
      if (key) {
        setLastPingClearedAfterId(key);
        window.localStorage?.setItem('sdn_last_ping_cleared_after_id_v1', String(key));
      }
    } catch (e) {
      // ignore
    }
    setPingResult(null);
    setFeedback('Last ping cleared.');
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

  const hasPingResult = Boolean(
    pingResult &&
    (pingResult.id || pingResult.flow_id || pingResult.command || pingResult.output || pingResult.src_host || pingResult.dst_host)
  );

  const mergedPingHistory = (() => {
    const merged = [...pingHistory, ...(recentPingEvents || [])];
    const seen = new Set();
    const deduped = merged.filter((item) => {
      const id = item?.id || item?.flow_id || `${item?.src_host || ''}-${item?.dst_host || ''}-${item?.timestamp || ''}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const sorted = deduped.sort((a, b) => getPingTimeMs(b) - getPingTimeMs(a));
    if (recentPingListClearedAfterId) {
      const cleared = getPingSequence({ id: recentPingListClearedAfterId });
      return sorted.filter((item) => {
        const seq = getPingSequence(item);
        if (seq != null && cleared != null) return seq > cleared;
        const key = (item?.id || item?.flow_id || '').toString();
        if (key) return key !== recentPingListClearedAfterId;
        const t = getPingTimeMs(item);
        return t > recentPingListClearedAt;
      });
    }
    if (!recentPingListClearedAt) return sorted;
    return sorted.filter((item) => {
      const t = getPingTimeMs(item);
      return t > recentPingListClearedAt;
    });
  })();

  const sequentialRecentPingHistory = [...mergedPingHistory]
    .sort((a, b) => getPingTimeMs(a) - getPingTimeMs(b))
    .slice(-5);

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
            {hasPingResult ? (
              <div onClick={handlePingSummaryClick} role="button" tabIndex={0} className="ping-summary glass-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <i className={`bi ${pingResult.status && pingResult.status.toLowerCase().includes('success') ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-danger'}`} style={{ fontSize: 20 }} />
                <div style={{ lineHeight: 1.15 }}>
                  <div style={{ fontWeight: 600 }}>{pingResult.src_host} → {pingResult.dst_host}</div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    {pingResult.status} • {pingResult.round_trip_time || (pingResult.latency_ms != null ? `${pingResult.latency_ms} ms` : '—')}
                  </div>
                  {pingResult.output ? (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 420 }}>
                      {String(pingResult.output).split('\n')[0]}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

           <button className="btn btn-outline-primary" onClick={refreshOverview}>
  <i className="bi bi-arrow-clockwise me-1" /> Refresh
</button>

{showClearBtn && (
  <button className="btn btn-outline-secondary" onClick={handleClearLastPing}>
    Clear Last Ping
  </button>
)}
            
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
            </div>          </div>

          <div className="row mt-4 g-4">
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
                  {hasPingResult ? (
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
                          <tr><th>Packets</th><td>{pingResult.packets_transmitted || pingResult.packets || '—'} tx / {pingResult.packets_received || '—'} rx</td></tr>
                          <tr><th>Packet Loss</th><td>{pingResult.packet_loss || (pingResult.packet_loss_pct != null ? `${pingResult.packet_loss_pct}%` : '—')}</td></tr>
                          <tr><th>Round Trip</th><td>{pingResult.round_trip_time || (pingResult.latency_ms != null ? `${pingResult.latency_ms} ms` : '—')}</td></tr>
                          <tr><th>Timestamp</th><td>{pingResult.timestamp || pingResult.time || '—'}</td></tr>
                          {pingResult.output ? (
                            <tr>
                              <th>Output</th>
                              <td>
                                <pre className="mb-0" style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#0b1220', color: '#e2e8f0', padding: 10, borderRadius: 8 }}>
                                  {String(pingResult.output).trim()}
                                </pre>
                              </td>
                            </tr>
                          ) : null}
                          <tr><th>Severity</th><td>{(() => {
                            const sev = pingResult.generated_alerts?.reduce((acc, a) => Math.max(acc, a?.severity || 0), 0) || 0;
                            if (sev >= 8) return 'Critical';
                            if (sev >= 5) return 'High';
                            if (sev >= 3) return 'Medium';
                            if (sev > 0) return 'Low';
                            return 'None';
                          })()}</td></tr>
                          <tr><th>Attacker</th><td>{(pingResult.attack_detected || (pingResult.src_host || '').startsWith('atk_') || (pingResult.dst_host || '').startsWith('atk_')) ? 'Yes' : 'No'}</td></tr>
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
                    <p className="text-muted mb-0">No ping result in the last 10 seconds.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="col-12 col-xl-6">
              <div className="card result-card h-100">
                <div className="card-header">
                  <h5>Terminal Traffic Mode</h5>
                </div>
                <div className="card-body">
                  <p className="mb-2">Traffic tests now run from the Mininet terminal in VS Code.</p>
                  <p className="text-muted mb-0">
                    Example: <code>user1 iperf mail_srv</code>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="row mt-4 g-4">
            <div className="col-12 col-xl-6">
              <div className="card h-100">
                <div className="card-header">
                  <div className="d-flex justify-content-between align-items-center gap-2">
                    <h5 className="mb-0">Recent Ping Activity</h5>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleClearPingActivity}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  {mergedPingHistory.length ? (
                    <div className="list-group list-group-flush">
                      {sequentialRecentPingHistory.map((flow, index) => (
                        <div
                          key={flow.id || `${flow.src_host}-${flow.dst_host}-${flow.timestamp}`}
                          className="list-group-item list-group-item-action"
                          onClick={() => (flow.id ? handleFlowClick(flow) : null)}
                          role="button"
                          style={{ cursor: flow.id ? 'pointer' : 'default' }}
                        >
                          <div className="d-flex justify-content-between gap-3">
                            <small className="text-muted">
                              <strong>#{String(index + 1).padStart(2, '0')}</strong>
                              {' | '}
                              <strong>{flow.src_host}</strong> → <strong>{flow.dst_host}</strong>
                              {' '}| {flow.protocol}
                              {' '}| {flow.packets} packets
                              {' '}| {flow.bytes} bytes
                            </small>
                            <small className="text-muted">{formatPingTimelineTime(flow)}</small>
                          </div>
                          <div className="d-flex justify-content-between gap-3 mt-1">
                            <small className="text-muted">Flow ID: <code>{flow.id}</code></small>
                            <span className={`badge ${flow.status === 'active' ? 'bg-success' : 'bg-danger'}`}>
                              {flow.status || 'active'}
                            </span>
                          </div>
                          {flow.output ? (
                            <div className="mt-1">
                              <small className="text-muted">{flow.output}</small>
                            </div>
                          ) : null}
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
  );
}
