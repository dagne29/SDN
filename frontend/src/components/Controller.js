import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { controllerAPI, idsAPI, pingAPI, trafficAPI, topologyAPI } from '../services/api';

const controllerSections = [
  { key: 'overview', label: 'Overview', path: '/controller' },
  { key: 'status', label: 'Network Status', path: '/controller/status' },
  { key: 'switches', label: 'Switch & Host Monitoring', path: '/controller/switches' },
  { key: 'flows', label: 'Flow Management', path: '/controller/flows' },
  { key: 'traffic', label: 'Traffic Control', path: '/controller/traffic' },
  { key: 'ids', label: 'IDS / Security', path: '/controller/ids' },
  { key: 'logs', label: 'Logs & Performance', path: '/controller/logs' },
];

function SectionNav({ activeKey }) {
  return (
    <div className="d-flex flex-wrap gap-2 mb-4">
      {controllerSections.map((section) => (
        <Link
          key={section.key}
          to={section.path}
          className={`btn btn-sm ${activeKey === section.key ? 'btn-dark' : 'btn-outline-dark'}`}
        >
          {section.label}
        </Link>
      ))}
    </div>
  );
}

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

export default function Controller() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [flows, setFlows] = useState([]);
  const [switches, setSwitches] = useState({});
  const [portStats, setPortStats] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [topologyHosts, setTopologyHosts] = useState({});
  const [pingStats, setPingStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith('/controller/status')) return 'status';
    if (location.pathname.startsWith('/controller/switches')) return 'switches';
    if (location.pathname.startsWith('/controller/flows')) return 'flows';
    if (location.pathname.startsWith('/controller/traffic')) return 'traffic';
    if (location.pathname.startsWith('/controller/ids')) return 'ids';
    if (location.pathname.startsWith('/controller/logs')) return 'logs';
    return 'overview';
  }, [location.pathname]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    try {
      const [statRes, flowsRes, swRes, psRes, alertsRes, hostsRes, pingStatsRes] = await Promise.all([
        controllerAPI.getStatus(),
        controllerAPI.getFlows(),
        controllerAPI.getSwitches(),
        trafficAPI.getPortStats(),
        idsAPI.getAlerts(20),
        topologyAPI.getHosts(),
        pingAPI.getStats(),
      ]);

      setStatus(statRes.data || {});
      setFlows(flowsRes.data || []);
      setSwitches(swRes.data || {});
      setPortStats(psRes.data || []);
      setAlerts(alertsRes.data || []);
      setTopologyHosts(hostsRes.data || {});
      setPingStats(pingStatsRes.data || null);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching controller data', err);
    }
  };

  const handleFlowClick = (flow) => {
    navigate(`/flows/${flow.id}`);
  };

  const attackerHosts = Object.entries(topologyHosts).filter(([, data]) => (data.role || '').toLowerCase() === 'attacker');

  if (loading) {
    return (
      <div className="p-5 text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3">Loading controller status...</p>
      </div>
    );
  }

  return (
    <div className="container-fluid p-4">
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3">
        <div>
          <h2 className="mb-1">Controller</h2>
          <p className="text-muted mb-0">Overall activity control for status, monitoring, flows, traffic, IDS, logs, and performance.</p>
        </div>
        <div className="text-muted small">
          {status?.flow_count || flows.length} flows, {status?.alert_count || alerts.length} alerts, {status?.switches?.length || Object.keys(switches).length} switches
        </div>
      </div>

      <SectionNav activeKey={activeKey} />

      {activeKey === 'overview' ? (
        <>
          <div className="row g-4 mb-4">
            <MetricCard title="Network Status" value={status?.topology_running ? 'Online' : 'Offline'} detail="Topology health" accent={status?.topology_running ? 'success' : 'danger'} />
            <MetricCard title="Switch Monitoring" value={status?.switches?.length || Object.keys(switches).length} detail="Managed switches" accent="primary" />
            <MetricCard title="Host Monitoring" value={status?.hosts?.length || 0} detail="Registered hosts" accent="info" />
            <MetricCard title="IDS Alerts" value={status?.alert_count || alerts.length} detail="Current alert volume" accent="warning" />
          </div>

          <div className="row g-4">
            <div className="col-12 col-lg-6">
              <div className="card h-100">
                <div className="card-header"><strong>Quick Access</strong></div>
                <div className="card-body d-flex flex-wrap gap-2">
                  <button className="btn btn-primary" onClick={() => navigate('/controller/status')}>Network Status</button>
                  <button className="btn btn-outline-primary" onClick={() => navigate('/controller/switches')}>Switches & Hosts</button>
                  <button className="btn btn-outline-dark" onClick={() => navigate('/controller/flows')}>Flow Management</button>
                  <button className="btn btn-outline-success" onClick={() => navigate('/controller/traffic')}>Traffic Control</button>
                  <button className="btn btn-outline-danger" onClick={() => navigate('/controller/ids')}>IDS / Security</button>
                  <button className="btn btn-outline-secondary" onClick={() => navigate('/controller/logs')}>Logs & Performance</button>
                </div>
              </div>
            </div>
            <div className="col-12 col-lg-6">
              <div className="card h-100">
                <div className="card-header"><strong>Live Control Snapshot</strong></div>
                <div className="card-body">
                  <div className="d-flex justify-content-between border-bottom py-2"><span>Controller</span><span className="badge bg-success">Connected</span></div>
                  <div className="d-flex justify-content-between border-bottom py-2"><span>Topology</span><span className="badge bg-success">Running</span></div>
                  <div className="d-flex justify-content-between border-bottom py-2"><span>Flows</span><span>{flows.length}</span></div>
                  <div className="d-flex justify-content-between border-bottom py-2"><span>Ping Events</span><span>{pingStats?.total_pings || 0}</span></div>
                  <div className="d-flex justify-content-between border-bottom py-2"><span>Alerts</span><span>{alerts.length}</span></div>
                  <div className="d-flex justify-content-between pt-2"><span>Blocked IPs</span><span>{status?.blocked_ips || 0}</span></div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {activeKey === 'status' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Network Status</strong></div>
              <div className="card-body">
                <div className="d-flex justify-content-between border-bottom py-2"><span>Controller Connected</span><span className="badge bg-success">{String(status?.controller_connected ?? true)}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Topology Running</span><span className="badge bg-success">{String(status?.topology_running ?? true)}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Flow Count</span><span>{status?.flow_count || flows.length}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Alert Count</span><span>{status?.alert_count || alerts.length}</span></div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>Overall Activity</strong></div>
              <div className="card-body">
                <div className="d-flex justify-content-between border-bottom py-2"><span>Managed Switches</span><span>{Object.keys(switches).length}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Registered Hosts</span><span>{status?.hosts?.length || 0}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Current Flows</span><span>{flows.length}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Traffic Samples</span><span>{portStats.length}</span></div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'switches' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-7">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>Switch & Host Monitoring</strong></div>
              <div className="card-body">
                <h6 className="mb-3">Switches</h6>
                {Object.keys(switches).length ? (
                  Object.entries(switches).map(([sid, sdata]) => (
                    <div key={sid} className="border-bottom py-2">
                      <div className="fw-semibold">{sid} - {sdata.name || 'Switch'}</div>
                      <div className="small text-muted">Ports: {sdata.ports || (sdata.port_stats ? Object.keys(sdata.port_stats).length : '—')} | Status: {sdata.status || 'online'}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted mb-0">No switches registered.</p>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-5">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Hosts</strong></div>
              <div className="card-body">
                {status?.hosts?.length ? (
                  status.hosts.map((host) => (
                    <div key={host} className="d-flex justify-content-between border-bottom py-2">
                      <span>{host}</span>
                      <span className="badge bg-secondary">{topologyHosts[host]?.role || 'host'}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted mb-0">No hosts available.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'flows' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Flow Management</strong></div>
              <div className="card-body">
                <p className="text-muted">Controller flow table is available below. Click any flow for details.</p>
                <button className="btn btn-primary btn-sm mb-3" onClick={() => navigate('/controller/flows')}>Open Controller Flows</button>
                <div className="list-group">
                  {flows.slice().reverse().slice(0, 8).map((flow) => (
                    <button key={flow.id} type="button" className="list-group-item list-group-item-action" onClick={() => handleFlowClick(flow)}>
                      <div className="d-flex justify-content-between">
                        <strong>{flow.id}</strong>
                        <span className="badge bg-secondary">{flow.protocol || 'ICMP'}</span>
                      </div>
                      <div className="small text-muted">{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>Recent Flows</strong></div>
              <div className="card-body">
                {flows.length ? (
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead className="table-light">
                        <tr>
                          <th>ID</th>
                          <th>Source</th>
                          <th>Destination</th>
                          <th>Protocol</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flows.slice().reverse().slice(0, 8).map((flow) => (
                          <tr key={flow.id} style={{ cursor: 'pointer' }} onClick={() => handleFlowClick(flow)}>
                            <td><code>{flow.id}</code></td>
                            <td>{flow.src_host || flow.src_ip}</td>
                            <td>{flow.dst_host || flow.dst_ip}</td>
                            <td>{flow.protocol || 'ICMP'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted mb-0">No flows available yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'traffic' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-success text-white"><strong>Traffic Control</strong></div>
              <div className="card-body">
                <p className="text-muted">Use the Traffic section to run ping and iperf tests, inspect live traffic, and apply filters.</p>
                <button className="btn btn-success btn-sm" onClick={() => navigate('/traffic')}>Open Traffic Hub</button>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Traffic Samples</strong></div>
              <div className="card-body">
                {portStats.length ? (
                  portStats.map((ps) => (
                    <div key={ps.switch} className="d-flex justify-content-between border-bottom py-2">
                      <span>{ps.switch}</span>
                      <span>{ps.utilization}% utilization</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted mb-0">No port stats available.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'ids' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-danger text-white"><strong>IDS / Security</strong></div>
              <div className="card-body">
                <p className="text-muted">IDS alerts are monitored here and summarized across the system.</p>
                <button className="btn btn-danger btn-sm" onClick={() => navigate('/alerts')}>Open IDS Alerts</button>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-warning text-dark"><strong>Recent Alerts</strong></div>
              <div className="card-body">
                {alerts.length ? (
                  alerts.slice().reverse().slice(0, 8).map((alert) => (
                    <div key={alert.id} className="border-bottom py-2">
                      <div className="fw-semibold">{alert.type}</div>
                      <div className="small text-muted">{alert.source_host} → {alert.destination_host}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted mb-0">No recent alerts.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeKey === 'logs' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-secondary text-white"><strong>Logs</strong></div>
              <div className="card-body">
                <div className="d-flex justify-content-between border-bottom py-2"><span>Controller Events</span><span>{flows.length}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>IDS Events</span><span>{alerts.length}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Recent Updates</span><span>{status?.timestamp || 'now'}</span></div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Performance</strong></div>
              <div className="card-body">
                <div className="d-flex justify-content-between border-bottom py-2"><span>Managed Hosts</span><span>{status?.hosts?.length || 0}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Managed Switches</span><span>{status?.switches?.length || Object.keys(switches).length}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Installed Flows</span><span>{status?.flow_count || flows.length}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Active Alerts</span><span>{status?.alert_count || alerts.length}</span></div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
