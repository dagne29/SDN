import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import apiClient, { mininetAPI, pingAPI, trafficAPI } from '../services/api';
import { appendPingHistory, clearPingHistory, formatPingTimelineTime, getPingSequence, getPingTimeMs, mergePingHistory, readPingHistory } from '../services/pingHistory';

function MetricCard({ title, value, detail, accent = 'primary' }) {
  return (
    <div className="col-12 col-sm-6 col-xl-3">
      <div className="card h-100">
        <div className="card-body">
          <div className="text-muted small">{title}</div>
          <div className={`fs-3 fw-bold text-${accent}`}>{value}</div>
          {detail ? <div className="small text-muted">{detail}</div> : null}
        </div>
      </div>
    </div>
  );
}

function BarList({ items, getLabel, getValue, maxValue }) {
  const top = maxValue || Math.max(...items.map((item) => getValue(item)), 1);
  return (
    <div className="d-flex flex-column gap-3">
      {items.map((item) => {
        const value = getValue(item);
        const pct = top ? Math.max(4, Math.round((value / top) * 100)) : 4;
        return (
          <div key={getLabel(item)}>
            <div className="d-flex justify-content-between small mb-1">
              <span>{getLabel(item)}</span>
              <span>{value}</span>
            </div>
            <div className="progress" style={{ height: 8 }}>
              <div className="progress-bar" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function groupPingRequests(flows) {
  const sorted = [...flows].sort((a, b) => {
    const ta = Date.parse(a?.timestamp || a?.time || '') || 0;
    const tb = Date.parse(b?.timestamp || b?.time || '') || 0;
    return tb - ta;
  });

  const groups = [];
  const used = new Set();

  sorted.forEach((flow, index) => {
    if (!flow || used.has(flow.id)) return;

    const origin = (flow.origin || '').toString().toLowerCase();
    if (!origin.includes('pingall')) {
      groups.push(flow);
      used.add(flow.id);
      return;
    }

    const baseTime = Date.parse(flow?.timestamp || flow?.time || '') || 0;
    const cluster = [flow];
    used.add(flow.id);

    for (let i = index + 1; i < sorted.length; i += 1) {
      const candidate = sorted[i];
      if (!candidate || used.has(candidate.id)) continue;
      const candidateOrigin = (candidate.origin || '').toString().toLowerCase();
      if (!candidateOrigin.includes('pingall')) continue;
      const candidateTime = Date.parse(candidate?.timestamp || candidate?.time || '') || 0;
      if (Math.abs(baseTime - candidateTime) > 5000) continue;
      cluster.push(candidate);
      used.add(candidate.id);
    }

    const successCount = cluster.filter((item) => (item.status || '').toLowerCase() === 'success').length;
    const avgLatency = cluster.length
      ? roundTo(cluster.reduce((sum, item) => sum + Number(item.latency_ms || 0), 0) / cluster.length, 3)
      : 0;

    groups.push({
      ...flow,
      id: `PINGALL-${flow.id}`,
      src_host: 'All Hosts',
      dst_host: `${cluster.length} connections`,
      status: successCount === cluster.length ? 'success' : successCount > 0 ? 'partial' : 'failed',
      latency_ms: avgLatency,
      round_trip_time: `${avgLatency} ms avg`,
      packets: cluster.reduce((sum, item) => sum + Number(item.packets || 0), 0),
      packets_transmitted: cluster.reduce((sum, item) => sum + Number(item.packets_transmitted ?? item.packets ?? 0), 0),
      packets_received: cluster.reduce((sum, item) => sum + Number(item.packets_received ?? 0), 0),
      bytes: cluster.reduce((sum, item) => sum + Number(item.bytes || 0), 0),
      packet_loss: `${cluster.length - successCount} failed`,
      output: `Pingall summary: ${cluster.length} connections tested, ${successCount} successful, ${cluster.length - successCount} failed.`,
      grouped_flows: cluster,
      is_grouped_pingall: true,
    });
  });

  return groups;
}

export default function TrafficAnalysis() {
  const apiBaseUrl = apiClient?.defaults?.baseURL || '';
  const location = useLocation();
  const [flows, setFlows] = useState([]);
  const [archivedFlows, setArchivedFlows] = useState(() => readPingHistory());
  const [recentPingsClearedAt, setRecentPingsClearedAt] = useState(() => {
    try {
      const raw = window?.localStorage?.getItem('sdn_recent_pings_cleared_at_v1');
      const value = raw ? Number(raw) : 0;
      return Number.isFinite(value) ? value : 0;
    } catch (e) {
      return 0;
    }
  });
  const [recentPingsClearedAfterId, setRecentPingsClearedAfterId] = useState(() => {
    try {
      return window?.localStorage?.getItem('sdn_recent_pings_cleared_after_id_v1') || '';
    } catch (e) {
      return '';
    }
  });
  const [stats, setStats] = useState(null);
  const [hosts, setHosts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pingSelection, setPingSelection] = useState({ src: 'user1', dst: 'mail_srv' });
  const [pingRunning, setPingRunning] = useState(false);
  const [filterHost, setFilterHost] = useState('all');
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [filterWindow, setFilterWindow] = useState('24h');

  const handleClearRecentPingActivity = async () => {
    try {
      await pingAPI.clearAll({ includeFlows: true });
      clearPingHistory();
      setFlows([]);
      setArchivedFlows([]);
      setRecentPingsClearedAt(0);
      setRecentPingsClearedAfterId('');
      try {
        window?.localStorage?.removeItem('sdn_recent_pings_cleared_at_v1');
        window?.localStorage?.removeItem('sdn_recent_pings_cleared_after_id_v1');
      } catch (e) {
        // ignore
      }
      try {
        window?.dispatchEvent(new CustomEvent('sdn_recent_pings_cleared', { detail: { clearedAt: 0, clearedAfterId: '' } }));
      } catch (e) {
        // ignore
      }
      await fetchTrafficData();
    } catch (e) {
      console.error('Failed to clear recent ping activity:', e);
    }
  };

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith('/traffic/live')) return 'live';
    if (location.pathname.startsWith('/traffic/table')) return 'table';
    if (location.pathname.startsWith('/traffic/pings')) return 'pings';
    if (location.pathname.startsWith('/traffic/analyzer')) return 'analyzer';
    if (location.pathname.startsWith('/traffic/attack')) return 'attack';
    if (location.pathname.startsWith('/traffic/history')) return 'history';
    if (location.pathname.startsWith('/traffic/filters')) return 'filters';
    return 'overview';
  }, [location.pathname]);

  // Fetch traffic/ping data (used on load and after running a ping)
  const fetchTrafficData = async () => {
    try {
      const [pingsRes, pingStatsRes, statusRes] = await Promise.all([
        pingAPI.getAll({ limit: 100 }),
        pingAPI.getStats(),
        mininetAPI.getStatus(),
      ]);

      const pingData = pingsRes.data || [];
      setFlows(pingData);
      const nextArchive = appendPingHistory(pingData, { max: 200 });
      setArchivedFlows(nextArchive);
      setHosts(statusRes.data?.hosts || []);
      setAlerts(pingData.filter((ping) => ping.attack_detected || ((ping.generated_alerts || []).length > 0)));

      const combined = mergePingHistory(nextArchive, pingData, { max: 200 });
      const totalBytes = combined.reduce((acc, ping) => acc + Number(ping.bytes || 0), 0);
      const totalPackets = combined.reduce((acc, ping) => acc + Number(ping.packets || 0), 0);
      const suspiciousFlows = combined.filter((ping) => ping.attack_detected || (ping.status || '').toLowerCase() === 'suspicious').length;
      const avgLatency = combined.length
        ? roundTo(combined.reduce((acc, ping) => acc + Number(ping.latency_ms || 0), 0) / combined.length, 3)
        : 0;

      setStats({
        ...(pingStatsRes.data || {}),
        total_bytes: totalBytes,
        total_packets: totalPackets,
        total_flows: combined.length,
        active_flows: combined.filter((ping) => (ping.status || '').toLowerCase() === 'active').length,
        suspicious_flows: suspiciousFlows,
        bandwidth_in: `${roundTo(combined.reduce((acc, ping) => acc + Number(ping.bandwidth_mbps || 0), 0), 2)} Mbps`,
        avg_latency_ms: avgLatency,
      });

      if (statusRes.data?.hosts?.length > 1) {
        setPingSelection({ src: statusRes.data.hosts[0], dst: statusRes.data.hosts[1] });
      }
    } catch (error) {
      console.error('Error fetching traffic data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrafficData();
    const interval = setInterval(fetchTrafficData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchTrafficData();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const handler = (event) => {
      const next = Number(event?.detail?.clearedAt || 0);
      if (!Number.isFinite(next) || next <= 0) return;
      setRecentPingsClearedAt(next);
      if (event?.detail?.clearedAfterId) {
        setRecentPingsClearedAfterId(String(event.detail.clearedAfterId));
      }
    };
    window.addEventListener('sdn_recent_pings_cleared', handler);
    return () => window.removeEventListener('sdn_recent_pings_cleared', handler);
  }, []);

  function roundTo(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  const trafficFlows = useMemo(() => {
    const merged = mergePingHistory(archivedFlows, flows, { max: 200 });
    return merged.filter((flow) => flow);
  }, [archivedFlows, flows]);
  const pingFlows = trafficFlows.filter((flow) => {
    const activityType = (flow.activity_type || '').toString().toLowerCase();
    const cmd = (flow.command || '').toString().toLowerCase();
    return activityType === 'ping' || cmd.includes('ping');
  });
  const visiblePingFlows = useMemo(() => {
    if (recentPingsClearedAfterId) {
      const clearedSeq = getPingSequence({ id: recentPingsClearedAfterId });
      return pingFlows.filter((flow) => {
        const seq = getPingSequence(flow);
        if (seq != null && clearedSeq != null) return seq > clearedSeq;
        const key = (flow?.id || flow?.flow_id || '').toString();
        if (key) return key !== recentPingsClearedAfterId;
        const t = getPingTimeMs(flow);
        return t > recentPingsClearedAt;
      });
    }
    if (!recentPingsClearedAt) return pingFlows;
    return pingFlows.filter((flow) => {
      const t = getPingTimeMs(flow);
      return t > recentPingsClearedAt;
    });
  }, [pingFlows, recentPingsClearedAt, recentPingsClearedAfterId]);
  const groupedVisiblePingFlows = useMemo(() => groupPingRequests(visiblePingFlows), [visiblePingFlows]);
  const recentPingActivity = useMemo(
    () => [...groupedVisiblePingFlows].sort((a, b) => getPingTimeMs(a) - getPingTimeMs(b)).slice(-4),
    [groupedVisiblePingFlows]
  );
  const suspiciousFlows = trafficFlows.filter((flow) => {
    const status = (flow.status || '').toString().toLowerCase();
    const src = (flow.src_host || '').toString().toLowerCase();
    return status === 'suspicious' || src.startsWith('atk_');
  });

  const filteredFlows = trafficFlows.filter((flow) => {
    const hostMatch =
      filterHost === 'all' ||
      flow.src_host === filterHost ||
      flow.dst_host === filterHost;
    const protocolMatch =
      filterProtocol === 'all' ||
      (flow.protocol || '').toUpperCase() === filterProtocol.toUpperCase();
    return hostMatch && protocolMatch;
  });

  const protocolCounts = Object.entries(
    trafficFlows.reduce((acc, flow) => {
      const protocol = (flow.protocol || 'UNKNOWN').toUpperCase();
      acc[protocol] = (acc[protocol] || 0) + 1;
      return acc;
    }, {})
  ).map(([protocol, count]) => ({ protocol, count }));

  const topTalkers = Object.entries(
    trafficFlows.reduce((acc, flow) => {
      const host = flow.src_host || flow.src_ip || 'unknown';
      acc[host] = (acc[host] || 0) + Number(flow.bytes || 0);
      return acc;
    }, {})
  )
    .map(([host, bytes]) => ({ host, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 6);

  const bandwidthByHost = Object.entries(
    trafficFlows.reduce((acc, flow) => {
      const host = flow.src_host || flow.src_ip || 'unknown';
      acc[host] = (acc[host] || 0) + Number(flow.bandwidth_mbps || 0);
      return acc;
    }, {})
  )
    .map(([host, bandwidth]) => ({ host, bandwidth: Number(bandwidth.toFixed(2)) }))
    .sort((a, b) => b.bandwidth - a.bandwidth)
    .slice(0, 6);

  const openPingTest = async () => {
    try {
      setPingRunning(true);
      await trafficAPI.runPingTest(pingSelection.src, pingSelection.dst);
      // refresh results after running the ping
      await fetchTrafficData();
    } catch (error) {
      console.error('Ping test failed:', error);
    } finally {
      setPingRunning(false);
    }
  };

  if (loading) return <div className="p-5 text-center">Loading traffic data...</div>;

  return (
    <div className="container-fluid p-4">
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3">
        <div>
          <h2 className="mb-1">Traffic</h2>
          <p className="text-muted mb-0">Overview, live activity, flows, analysis, attacks, history, and filters. Run ping tests from this dashboard (select hosts and click Run Ping).</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="text-muted small">
            {trafficFlows.length} flows tracked, {alerts.length} alerts, {hosts.length} hosts
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleRefresh} disabled={refreshing}>
            <i className="bi bi-arrow-clockwise me-1" /> Refresh
          </button>
        </div>
      </div>

      {activeKey === 'overview' ? (
        <>
          <div className="row g-4 mb-4">
            <MetricCard title="Total Traffic" value={`${stats?.bandwidth_in || '0.00 Mbps'}`} detail="Recent inbound bandwidth" accent="primary" />
            <MetricCard title="Active Flows" value={stats?.active_flows || 0} detail="Flows currently marked active" accent="success" />
            <MetricCard title="Packet Rate" value={stats?.total_packets || 0} detail="Packets observed in recent flows" accent="info" />
            <MetricCard title="Suspicious Flows" value={stats?.suspicious_flows || 0} detail="Traffic flagged as suspicious" accent="danger" />
          </div>
          <div className="row g-4">
            <div className="col-12 col-xl-6">
              <div className="card h-100">
                <div className="card-header bg-primary text-white">
                  <strong>Protocol Mix</strong>
                </div>
                <div className="card-body">
                  {protocolCounts.length ? (
                    <BarList
                      items={protocolCounts}
                      getLabel={(item) => item.protocol}
                      getValue={(item) => item.count}
                    />
                  ) : (
                    <p className="text-muted mb-0">No protocol data available yet.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="col-12 col-xl-6">
              <div className="card h-100">
                <div className="card-header bg-dark text-white">
                  <strong>Recent Live Flow Snapshot</strong>
                </div>
                <div className="card-body">
                {trafficFlows.slice().reverse().slice(0, 5).map((flow) => (
                  <div key={flow.id} className="d-flex justify-content-between border-bottom py-2">
                    <div>
                      <div className="fw-semibold">{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</div>
                      <div className="small text-muted">{flow.protocol || 'ICMP'} | {flow.bytes || 0} bytes | {flow.packets || 0} packets</div>
                      {flow.output ? (
                        <div className="small text-muted">{flow.output}</div>
                      ) : null}
                    </div>
                    <div className="text-end small text-muted">{flow.timestamp}</div>
                  </div>
                ))}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {activeKey === 'live' ? (
        <div className="card">
          <div className="card-header bg-primary text-white">
            <strong>Live Traffic</strong>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-striped table-hover">
                <thead className="table-light">
                  <tr>
                    <th>Source → Destination</th>
                    <th>Protocol</th>
                    <th>Bytes</th>
                    <th>Packets</th>
                    <th>Status</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {trafficFlows.slice().reverse().slice(0, 20).map((flow) => (
                    <tr key={flow.id}>
                      <td>{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</td>
                      <td><span className="badge bg-secondary">{flow.protocol || 'ICMP'}</span></td>
                      <td>{flow.bytes || 0}</td>
                      <td>{flow.packets || 0}</td>
                      <td><span className={`badge ${flow.status === 'active' ? 'bg-success' : 'bg-warning text-dark'}`}>{flow.status || 'active'}</span></td>
                      <td>{flow.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'table' ? (
        <div className="card">
          <div className="card-header bg-dark text-white">
            <strong>Flow Table</strong>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-sm table-striped">
                <thead className="table-light">
                  <tr>
                    <th>Flow ID</th>
                    <th>Match Fields</th>
                    <th>Actions</th>
                    <th>Duration</th>
                    <th>Protocol</th>
                    <th>Source</th>
                    <th>Destination</th>
                  </tr>
                </thead>
                <tbody>
                  {trafficFlows.slice().reverse().slice(0, 20).map((flow) => (
                    <tr key={flow.id}>
                      <td><code>{flow.id}</code></td>
                      <td>
                        <div className="small">
                          IP: {flow.src_ip || '—'} → {flow.dst_ip || '—'}
                          <br />
                          MAC: {flow.src_mac || '—'} → {flow.dst_mac || '—'}
                        </div>
                      </td>
                      <td>{flow.command || 'forward'}</td>
                      <td>{flow.latency_ms != null ? `${flow.latency_ms} ms` : '—'}</td>
                      <td>{flow.protocol || 'ICMP'}</td>
                      <td>{flow.src_host || flow.src_ip}</td>
                      <td>{flow.dst_host || flow.dst_ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'pings' ? (
        <div className="card">
          <div className="card-header bg-primary text-white">
            <strong>Ping Results (Mininet / Terminal)</strong>
          </div>
          <div className="card-body">
            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-2 mb-3">
                <div className="text-muted small">
                {groupedVisiblePingFlows.length} ping request(s) shown (raw events: {pingFlows.length}). Run from dashboard or Mininet terminal.
              </div>
            </div>
            <div className="card border-0 bg-light mb-4">
              <div className="card-body">
                <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-2 mb-3">
                  <div>
                    <div className="fw-semibold">Recent Ping Activity</div>
                    <div className="small text-muted">Latest ping events now appear here instead of the sidebar.</div>
                  </div>
                  <button type="button" className="btn btn-sm btn-danger" onClick={handleClearRecentPingActivity}>
                    <i className="bi bi-trash3 me-1" />
                    Clear Recent Activity
                  </button>
                </div>
                {recentPingActivity.length ? (
                  <div className="row g-3">
                    {recentPingActivity.map((flow, index) => (
                      <div key={flow.id} className="col-12 col-xl-6">
                        <div className="card h-100 shadow-sm border-0">
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
                              <div className="fw-semibold">
                                #{String(index + 1).padStart(2, '0')} {flow.src_host || flow.src_ip || '—'} → {flow.dst_host || flow.dst_ip || '—'}
                              </div>
                              <span className={`badge ${(flow.status || '').toLowerCase().includes('success') ? 'bg-success' : 'bg-danger'}`}>
                                {flow.status || 'unknown'}
                              </span>
                            </div>
                            <div className="small text-muted mb-1">{flow.protocol || 'ICMP'} • {flow.packets || 0} pkts • {flow.bytes || 0} bytes</div>
                            <div className="small text-muted mb-1">RTT: {flow.round_trip_time || (flow.latency_ms != null ? `${flow.latency_ms} ms` : '—')}</div>
                            <div className="small text-muted mb-2">{formatPingTimelineTime(flow)}</div>
                            {flow.output ? (
                              <div className="small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {String(flow.output).trim()}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted small">No recent ping activity.</div>
                )}
              </div>
            </div>
            {!groupedVisiblePingFlows.length ? (
              <div className="alert alert-warning py-2">
                Dashboard is querying <code>{apiBaseUrl || '(unknown API base URL)'}</code>. If you pinged in Mininet and still see 0,
                Mininet is not posting to the same backend. Start Mininet with the reporting topology and set
                <code className="ms-1">SDN_PING_INGEST_URL</code> to <code>{apiBaseUrl ? `${apiBaseUrl}/pings/ingest` : 'http://&lt;backend&gt;:5000/api/pings/ingest'}</code>.
              </div>
            ) : null}
            <div className="table-responsive">
              <table className="table table-sm table-striped align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Source → Destination</th>
                    <th>Src IP</th>
                    <th>Dst IP</th>
                    <th>Attacker</th>
                    <th>Status</th>
                    <th>RTT</th>
                    <th>Loss</th>
                    <th>Packets</th>
                    <th>Timestamp</th>
                    <th style={{ minWidth: 260 }}>Output</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedVisiblePingFlows.slice(0, 25).map((flow) => (
                    <tr key={flow.id}>
                      <td className="fw-semibold">{flow.src_host || flow.src_ip || '—'} → {flow.dst_host || flow.dst_ip || '—'}</td>
                      <td className="small text-muted">{flow.src_ip || '—'}</td>
                      <td className="small text-muted">{flow.dst_ip || '—'}</td>
                      <td>
                        <span className={`badge ${(flow.attack_detected || (flow.src_host || '').startsWith('atk_') || (flow.dst_host || '').startsWith('atk_')) ? 'bg-danger' : 'bg-secondary'}`}>
                          {(flow.attack_detected || (flow.src_host || '').startsWith('atk_') || (flow.dst_host || '').startsWith('atk_')) ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${(flow.status || '').toLowerCase().includes('success') ? 'bg-success' : (flow.status || '').toLowerCase().includes('partial') ? 'bg-warning text-dark' : 'bg-danger'}`}>
                          {flow.status || 'unknown'}
                        </span>
                      </td>
                      <td>{flow.round_trip_time || (flow.latency_ms != null ? `${flow.latency_ms} ms` : '—')}</td>
                      <td>{flow.packet_loss || (flow.packet_loss_pct != null ? `${flow.packet_loss_pct}%` : '—')}</td>
                      <td>{flow.packets_transmitted ?? flow.packets ?? '—'} / {flow.packets_received ?? '—'}</td>
                      <td className="text-muted small">{flow.timestamp}</td>
                      <td>
                        {flow.output ? (
                          <details>
                            <summary className="small text-muted">show</summary>
                            <pre className="mt-2 mb-0" style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#0b1220', color: '#e2e8f0', padding: 10, borderRadius: 8 }}>
                              {String(flow.output).trim()}
                            </pre>
                            <div className="mt-2 small text-muted">
                              MAC: {flow.src_mac || '—'} → {flow.dst_mac || '—'}
                            </div>
                          </details>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!groupedVisiblePingFlows.length ? (
                    <tr>
                      <td colSpan="10" className="text-center text-muted">No ping results yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'analyzer' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-4">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>Protocol Distribution</strong></div>
              <div className="card-body">
                {protocolCounts.length ? (
                  <BarList items={protocolCounts} getLabel={(item) => item.protocol} getValue={(item) => item.count} />
                ) : (
                  <p className="text-muted mb-0">No protocol distribution available.</p>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-4">
            <div className="card h-100">
              <div className="card-header bg-success text-white"><strong>Top Talkers</strong></div>
              <div className="card-body">
                {topTalkers.length ? (
                  <BarList
                    items={topTalkers}
                    getLabel={(item) => item.host}
                    getValue={(item) => item.bytes}
                  />
                ) : (
                  <p className="text-muted mb-0">No top talker data yet.</p>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-4">
            <div className="card h-100">
              <div className="card-header bg-warning text-dark"><strong>Bandwidth by Host</strong></div>
              <div className="card-body">
                {bandwidthByHost.length ? (
                  <BarList
                    items={bandwidthByHost}
                    getLabel={(item) => item.host}
                    getValue={(item) => item.bandwidth}
                  />
                ) : (
                  <p className="text-muted mb-0">No bandwidth data yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'attack' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-danger text-white"><strong>Suspicious Traffic</strong></div>
              <div className="card-body">
                {suspiciousFlows.length ? (
                  <div className="list-group list-group-flush">
                    {suspiciousFlows.slice().reverse().slice(0, 10).map((flow) => (
                      <div key={flow.id} className="list-group-item">
                        <div className="fw-semibold">{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</div>
                        <div className="small text-muted">{flow.protocol || 'ICMP'} | {flow.command || '—'}</div>
                        <span className="badge bg-danger mt-2">{flow.status || 'suspicious'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted mb-0">No suspicious flows detected yet.</p>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-warning text-dark"><strong>Attack Alerts</strong></div>
              <div className="card-body">
                {alerts.length ? (
                  <div className="list-group list-group-flush">
                    {alerts.slice().reverse().slice(0, 10).map((alert) => (
                      <div key={alert.id} className="list-group-item">
                        <div className="fw-semibold">{alert.type}</div>
                        <div className="small text-muted">{alert.source_host} → {alert.destination_host}</div>
                        <div className="small text-muted">{alert.reason}</div>
                        <span className="badge bg-secondary mt-2">{alert.severity}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted mb-0">No attack alerts yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'history' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>Saved Flows</strong></div>
              <div className="card-body">
                {trafficFlows.slice().reverse().slice(0, 15).map((flow) => (
                  <div key={flow.id} className="border-bottom py-2">
                    <div className="fw-semibold">{flow.id}</div>
                    <div className="small text-muted">{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</div>
                    <div className="small text-muted">{flow.protocol || 'ICMP'} | {flow.timestamp}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Previous Tests</strong></div>
              <div className="card-body">
                {trafficFlows.filter((flow) => ['ping', 'traffic'].includes((flow.activity_type || '').toString().toLowerCase())).slice().reverse().slice(0, 15).map((flow) => (
                  <div key={flow.id} className="border-bottom py-2">
                    <div className="fw-semibold">{flow.command || flow.id}</div>
                    <div className="small text-muted">{flow.status || 'active'} | {flow.timestamp}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'filters' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-4">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>Filters & Controls</strong></div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label">By host</label>
                  <select className="form-select" value={filterHost} onChange={(event) => setFilterHost(event.target.value)}>
                    <option value="all">All hosts</option>
                    {hosts.map((host) => <option key={host} value={host}>{host}</option>)}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">By protocol</label>
                  <select className="form-select" value={filterProtocol} onChange={(event) => setFilterProtocol(event.target.value)}>
                    <option value="all">All protocols</option>
                    <option value="ICMP">ICMP</option>
                    <option value="TCP">TCP</option>
                    <option value="UDP">UDP</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">By time</label>
                  <select className="form-select" value={filterWindow} onChange={(event) => setFilterWindow(event.target.value)}>
                    <option value="1h">Last hour</option>
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-8">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Filtered Traffic</strong></div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-sm table-striped">
                    <thead className="table-light">
                      <tr>
                        <th>Flow</th>
                        <th>Protocol</th>
                        <th>Bytes</th>
                        <th>Packets</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFlows.slice().reverse().slice(0, 20).map((flow) => (
                        <tr key={flow.id}>
                          <td>{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</td>
                          <td>{flow.protocol || 'ICMP'}</td>
                          <td>{flow.bytes || 0}</td>
                          <td>{flow.packets || 0}</td>
                          <td>{flow.timestamp}</td>
                        </tr>
                      ))}
                      {!filteredFlows.length ? (
                        <tr>
                          <td colSpan="5" className="text-center text-muted">No flows match the current filters</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="text-muted small mt-2">Time filter is ready in the UI; the current backend only exposes recent flow history, so it acts as a visual preset for now.</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
