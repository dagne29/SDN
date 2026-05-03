import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { controllerAPI, idsAPI, pingAPI, trafficAPI, topologyAPI } from '../services/api';

const ATTACKER_TYPES = ['attacker','ddos','syn','arp','scan','brute','icmp'];

function MetricCard({ title, value, detail, accent = 'primary', flash = false }) {
  return (
    <div className="col-12 col-sm-6 col-xl-3">
      <div className={`card h-100 ${flash ? `border-${accent}` : ''}`} style={flash ? { boxShadow: `0 0 0 3px var(--bs-${accent}, #dc3545)22` } : {}}>
        <div className="card-body">
          <div className="text-muted small">{title}</div>
          <div className={`fs-3 fw-bold text-${accent}`}>{value}</div>
          {detail ? <div className="small text-muted">{detail}</div> : null}
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, val, ok }) {
  return (
    <div className="d-flex justify-content-between align-items-center border-bottom py-2">
      <span>{label}</span>
      <span className={`badge ${ok ? 'bg-success' : 'bg-danger'}`}>{val}</span>
    </div>
  );
}

export default function Controller() {
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus]           = useState(null);
  const [flows, setFlows]             = useState([]);
  const [switches, setSwitches]       = useState({});
  const [portStats, setPortStats]     = useState([]);
  const [alerts, setAlerts]           = useState([]);
  const [topologyHosts, setTopologyHosts] = useState({});
  const [pingStats, setPingStats]     = useState(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [fetchError, setFetchError]   = useState(false);
  const [newBlockBanner, setNewBlockBanner] = useState(null);

  const lastBlockedCountRef = useRef(0);
  const lastAttackerAlertIdsRef = useRef(new Set());

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith('/controller/status'))   return 'status';
    if (location.pathname.startsWith('/controller/switches')) return 'switches';
    if (location.pathname.startsWith('/controller/flows'))    return 'flows';
    if (location.pathname.startsWith('/controller/traffic'))  return 'traffic';
    if (location.pathname.startsWith('/controller/ids'))      return 'ids';
    if (location.pathname.startsWith('/controller/logs'))     return 'logs';
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
        idsAPI.getAlerts(50),
        topologyAPI.getHosts(),
        pingAPI.getStats(),
      ]);

      const nextAlerts = alertsRes.data || [];
      setStatus(statRes.data || {});
      setFlows(flowsRes.data || []);
      setSwitches(swRes.data || {});
      setPortStats(psRes.data || []);
      setAlerts(nextAlerts);
      setTopologyHosts(hostsRes.data || {});
      setPingStats(pingStatsRes.data || null);
      setFetchError(false);
      setLoading(false);

      // Detect new attacker alerts and surface a block banner
      const attackerAlerts = nextAlerts.filter(a =>
        ATTACKER_TYPES.some(r => (a.source_host||'').toLowerCase().includes(r)) ||
        a.severity === 'Critical' ||
        (a.type||'').toLowerCase().includes('attack') ||
        (a.type||'').toLowerCase().includes('flood')
      );
      const prevIds = lastAttackerAlertIdsRef.current;
      const novel   = attackerAlerts.filter(a => !prevIds.has(a.id));
      if (novel.length > 0) {
        const a = novel[0];
        setNewBlockBanner({
          text: `Controller blocked: ${a.source_host||a.source_ip||'Unknown'} [${a.type}]`,
          severity: a.severity,
          id: a.id,
        });
        setTimeout(() => setNewBlockBanner(null), 8000);
      }
      lastAttackerAlertIdsRef.current = new Set(attackerAlerts.map(a => a.id));
    } catch (err) {
      console.error('Error fetching controller data', err);
      setFetchError(true);
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await fetchAll(); } finally { setRefreshing(false); }
  };

  const controllerOnline = !fetchError && status?.controller_connected === true;
  const topologyOnline   = !fetchError && status?.topology_running === true;
  const overallOnline    = controllerOnline && topologyOnline;

  const attackerHosts    = Object.entries(topologyHosts).filter(([, d]) => ATTACKER_TYPES.includes((d.role||'').toLowerCase()));
  const attackerAlerts   = alerts.filter(a =>
    ATTACKER_TYPES.some(r => (a.source_host||'').toLowerCase().includes(r)) ||
    a.severity === 'Critical' ||
    (a.type||'').toLowerCase().includes('attack') ||
    (a.type||'').toLowerCase().includes('flood')
  );
  const blockedCount = status?.blocked_ips || attackerAlerts.filter(a => a.status === 'blocked').length;
  const switchCount  = Object.keys(switches).length || status?.switches?.length || 0;

  const handleFlowClick = (flow) => navigate(`/flows/${flow.id}`);

  if (loading) {
    return (
      <div className="p-5 text-center">
        <div className="spinner-border text-primary" role="status"/>
        <p className="mt-3">Loading controller status...</p>
      </div>
    );
  }

  return (
    <div className="container-fluid p-4">

      {/* ── System Offline Banner ── */}
      {!overallOnline && (
        <div className="alert alert-danger d-flex align-items-center gap-3 mb-3"
          style={{ borderLeft: '6px solid #7f1d1d', background: 'rgba(220,53,69,0.08)' }}>
          <i className="bi bi-exclamation-octagon-fill text-danger fs-3"/>
          <div>
            <div className="fw-bold fs-6">
              {fetchError
                ? 'Cannot reach backend — is Flask running on port 5000?'
                : !controllerOnline
                ? 'Ryu Controller is OFFLINE — Mininet may be disconnected'
                : 'Mininet Topology is OFFLINE'}
            </div>
            <div className="small text-muted mt-1">
              Dashboard is showing last-known state. Traffic control and flow management are unavailable while offline.
            </div>
          </div>
        </div>
      )}

      {/* ── Auto-block banner ── */}
      {newBlockBanner && (
        <div className="alert alert-warning d-flex align-items-center gap-3 mb-3 shadow"
          style={{ borderLeft: '6px solid #d97706', animation: 'ctrlSlideIn 0.3s ease' }}>
          <i className="bi bi-shield-x text-warning fs-4"/>
          <div className="flex-grow-1">
            <div className="fw-bold">⚡ Auto-Blocked: {newBlockBanner.text}</div>
            <div className="small text-muted">Controller detected {newBlockBanner.severity} severity threat and automatically blocked the source IP.</div>
          </div>
          <button type="button" className="btn-close" onClick={() => setNewBlockBanner(null)}/>
        </div>
      )}

      {/* ── Header ── */}
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3">
        <div>
          <h2 className="mb-1 d-flex align-items-center gap-2">
            Controller
            <span className={`badge ms-1 ${overallOnline ? 'bg-success' : 'bg-danger'}`}>
              {overallOnline ? 'Online' : 'Offline'}
            </span>
            {attackerAlerts.length > 0 && (
              <span className="badge bg-danger" style={{ fontSize: 12, animation: 'ctrlPulse 1.5s infinite' }}>
                <i className="bi bi-shield-exclamation me-1"/>{attackerAlerts.length} Threat{attackerAlerts.length !== 1 ? 's' : ''} Detected
              </span>
            )}
          </h2>
          <p className="text-muted mb-0">
            SDN Controller — monitors traffic, detects attackers, and automatically blocks threats.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="text-muted small">
            {flows.length} flows · {alerts.length} alerts · {switchCount} switches
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleRefresh} disabled={refreshing}>
            <i className="bi bi-arrow-clockwise me-1"/>Refresh
          </button>
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {activeKey === 'overview' && (
        <>
          <div className="row g-4 mb-4">
            <MetricCard title="System Status"    value={overallOnline ? 'Online' : 'Offline'} detail="Controller + Mininet"    accent={overallOnline ? 'success' : 'danger'} flash={!overallOnline}/>
            <MetricCard title="Managed Switches" value={switchCount}                            detail="OVS switches via Core Router" accent="primary"/>
            <MetricCard title="Threats Detected" value={attackerAlerts.length}                  detail="Active attacker alerts"  accent={attackerAlerts.length > 0 ? 'danger' : 'secondary'} flash={attackerAlerts.length > 0}/>
            <MetricCard title="Blocked IPs"      value={blockedCount}                           detail="Auto-blocked by controller" accent="warning"/>
          </div>

          {/* Attacker panel — only shown when attackers exist */}
          {attackerAlerts.length > 0 && (
            <div className="card border-danger shadow mb-4" style={{ borderLeft: '5px solid #dc3545' }}>
              <div className="card-header bg-danger text-white d-flex align-items-center gap-2">
                <i className="bi bi-shield-exclamation"/>
                <strong>⚠ Active Threats — Auto-Blocking Engaged</strong>
                <span className="badge bg-light text-danger ms-auto">{attackerAlerts.length}</span>
              </div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead className="table-light">
                      <tr><th>Source Host</th><th>Source IP</th><th>Attack Type</th><th>Severity</th><th>Status</th><th>Time</th></tr>
                    </thead>
                    <tbody>
                      {attackerAlerts.slice(0, 10).map(a => (
                        <tr key={a.id} style={{ background: a.severity === 'Critical' ? 'rgba(220,53,69,0.04)' : undefined }}>
                          <td><code>{a.source_host || '—'}</code></td>
                          <td><code className="text-danger">{a.source_ip || '—'}</code></td>
                          <td>{a.type}</td>
                          <td>
                            <span className={`badge bg-${a.severity==='Critical'?'danger':a.severity==='High'?'warning':'info'}`}>{a.severity}</span>
                          </td>
                          <td>
                            <span className={`badge bg-${a.status==='blocked'?'dark':a.status==='resolved'?'success':'danger'}`}>{a.status||'new'}</span>
                          </td>
                          <td className="small text-muted">{new Date(a.timestamp).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="row g-4">
            {/* Live Control Snapshot */}
            <div className="col-12 col-lg-6">
              <div className="card h-100">
                <div className="card-header"><strong>Live Control Snapshot</strong></div>
                <div className="card-body">
                  <StatusRow label="Ryu Controller"    val={controllerOnline ? 'Connected' : 'Disconnected'} ok={controllerOnline}/>
                  <StatusRow label="Mininet Topology"  val={topologyOnline   ? 'Running'   : 'Stopped'}      ok={topologyOnline}/>
                  <div className="d-flex justify-content-between border-bottom py-2"><span>Core Router</span><span className="badge bg-purple" style={{background:'#7c3aed'}}>r1 — Active</span></div>
                  <div className="d-flex justify-content-between border-bottom py-2"><span>Flows</span><span>{flows.length}</span></div>
                  <div className="d-flex justify-content-between border-bottom py-2"><span>Ping Events</span><span>{pingStats?.total_pings || 0}</span></div>
                  <div className="d-flex justify-content-between border-bottom py-2"><span>Alerts</span><span className={alerts.length > 0 ? 'text-warning fw-bold' : ''}>{alerts.length}</span></div>
                  <div className="d-flex justify-content-between border-bottom py-2">
                    <span>Auto Blocking</span>
                    <span className="badge bg-success"><i className="bi bi-shield-check me-1"/>Active</span>
                  </div>
                  <div className="d-flex justify-content-between py-2">
                    <span>Blocked IPs</span>
                    <span className={blockedCount > 0 ? 'fw-bold text-danger' : ''}>{blockedCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Attacker Hosts */}
            <div className="col-12 col-lg-6">
              <div className="card h-100">
                <div className="card-header d-flex align-items-center gap-2" style={{ background: attackerHosts.length > 0 ? '#fef2f2' : '#f0fdf4' }}>
                  <i className={`bi ${attackerHosts.length > 0 ? 'bi-exclamation-triangle text-danger' : 'bi-shield-check text-success'}`}/>
                  <strong>Known Attacker Hosts</strong>
                  <span className={`badge ms-auto ${attackerHosts.length > 0 ? 'bg-danger' : 'bg-success'}`}>{attackerHosts.length}</span>
                </div>
                <div className="card-body p-0">
                  {attackerHosts.length ? (
                    attackerHosts.map(([hid, host]) => (
                      <div key={hid} className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom" style={{ background: 'rgba(239,68,68,0.03)' }}>
                        <div>
                          <div className="fw-semibold" style={{ fontFamily: 'monospace' }}>{hid}</div>
                          <div className="small text-muted">IP: {host.ip||'—'} · MAC: {host.mac||'—'}</div>
                        </div>
                        <div className="d-flex flex-column gap-1 align-items-end">
                          <span className="badge bg-danger">{host.role||'attacker'}</span>
                          <span className="badge bg-dark" style={{ fontSize: 9 }}>Auto-blocked</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-success">
                      <i className="bi bi-shield-check fs-3 d-block mb-2"/>
                      <span className="small">No attacker hosts detected</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── STATUS ── */}
      {activeKey === 'status' && (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Network Status</strong></div>
              <div className="card-body">
                <StatusRow label="Controller Connected" val={String(controllerOnline)} ok={controllerOnline}/>
                <StatusRow label="Topology Running"     val={String(topologyOnline)}   ok={topologyOnline}/>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Core Router (r1)</span><span className="badge bg-success">Active</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Flow Count</span><span>{flows.length}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Alert Count</span><span>{alerts.length}</span></div>
                <div className="d-flex justify-content-between py-2"><span>Auto-Blocked IPs</span><span className={blockedCount > 0 ? 'text-danger fw-bold' : ''}>{blockedCount}</span></div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>System Overview</strong></div>
              <div className="card-body">
                <div className="d-flex justify-content-between border-bottom py-2"><span>Managed Switches</span><span>{switchCount}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Registered Hosts</span><span>{status?.hosts?.length || 0}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Attacker Hosts</span><span className={attackerHosts.length > 0 ? 'text-danger fw-bold' : ''}>{attackerHosts.length}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Current Flows</span><span>{flows.length}</span></div>
                <div className="d-flex justify-content-between py-2"><span>Traffic Samples</span><span>{portStats.length}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SWITCHES ── */}
      {activeKey === 'switches' && (
        <div className="row g-4">
          <div className="col-12 col-xl-7">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>Switch Monitoring (via Core Router)</strong></div>
              <div className="card-body">
                {Object.keys(switches).length ? (
                  Object.entries(switches).map(([sid, sdata]) => (
                    <div key={sid} className="border-bottom py-2">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <span className="fw-semibold">{sid}</span>
                          <span className="text-muted ms-2">— {sdata.name || 'Switch'}</span>
                        </div>
                        <span className={`badge ${(sdata.status||'online')==='online'?'bg-success':'bg-warning text-dark'}`}>{sdata.status||'online'}</span>
                      </div>
                      <div className="small text-muted">IP: {sdata.ip||'—'} · Ports: {sdata.ports||'—'}</div>
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
              <div className="card-header bg-dark text-white"><strong>Hosts by Role</strong></div>
              <div className="card-body p-0">
                {status?.hosts?.length ? (
                  status.hosts.map(host => {
                    const hdata = topologyHosts[host] || {};
                    const isAttacker = ATTACKER_TYPES.includes((hdata.role||'').toLowerCase());
                    return (
                      <div key={host} className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom"
                        style={{ background: isAttacker ? 'rgba(239,68,68,0.04)' : undefined }}>
                        <span style={{ fontFamily: 'monospace' }}>{host}</span>
                        <span className={`badge ${isAttacker ? 'bg-danger' : 'bg-secondary'}`}>{hdata.role || 'host'}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-muted text-center">No hosts available.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FLOWS ── */}
      {activeKey === 'flows' && (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Flow Management</strong></div>
              <div className="card-body">
                <p className="text-muted">Controller flow table. Click any flow for details.</p>
                <button className="btn btn-primary btn-sm mb-3" onClick={() => navigate('/controller/flows')}>
                  Open Controller Flows
                </button>
                <div className="list-group">
                  {flows.slice().reverse().slice(0, 8).map(flow => {
                    const isAttack = ATTACKER_TYPES.some(r => (flow.src_host||'').toLowerCase().includes(r));
                    return (
                      <button key={flow.id} type="button"
                        className={`list-group-item list-group-item-action ${isAttack ? 'list-group-item-danger' : ''}`}
                        onClick={() => handleFlowClick(flow)}>
                        <div className="d-flex justify-content-between">
                          <strong>{flow.id}</strong>
                          <span className={`badge ${isAttack ? 'bg-danger' : 'bg-secondary'}`}>{flow.protocol || 'ICMP'}</span>
                        </div>
                        <div className="small text-muted">{flow.src_host||flow.src_ip} → {flow.dst_host||flow.dst_ip}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>Recent Flows Table</strong></div>
              <div className="card-body p-0">
                {flows.length ? (
                  <div className="table-responsive">
                    <table className="table table-sm table-hover mb-0">
                      <thead className="table-light">
                        <tr><th>ID</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {flows.slice().reverse().slice(0, 10).map(flow => {
                          const isAttack = ATTACKER_TYPES.some(r => (flow.src_host||'').toLowerCase().includes(r));
                          return (
                            <tr key={flow.id} style={{ cursor: 'pointer', background: isAttack ? 'rgba(239,68,68,0.04)' : undefined }} onClick={() => handleFlowClick(flow)}>
                              <td><code>{flow.id}</code></td>
                              <td className={isAttack ? 'text-danger fw-semibold' : ''}>{flow.src_host||flow.src_ip}</td>
                              <td>{flow.dst_host||flow.dst_ip}</td>
                              <td>{flow.protocol||'ICMP'}</td>
                              <td><span className={`badge ${isAttack?'bg-danger':flow.status==='active'?'bg-success':'bg-secondary'}`}>{isAttack?'suspicious':flow.status||'active'}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 text-muted text-center">No flows available yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TRAFFIC ── */}
      {activeKey === 'traffic' && (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-success text-white"><strong>Traffic Control</strong></div>
              <div className="card-body">
                <p className="text-muted">Run ping/iperf tests, inspect live traffic, and apply filters.</p>
                <button className="btn btn-success btn-sm" onClick={() => navigate('/traffic')}>Open Traffic Hub</button>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Switch Utilization</strong></div>
              <div className="card-body p-0">
                {portStats.length ? portStats.map(ps => (
                  <div key={ps.switch} className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                    <span>{ps.switch} <span className="text-muted small">— {ps.name}</span></span>
                    <div className="d-flex align-items-center gap-2">
                      <div className="progress" style={{ width: 80, height: 6 }}>
                        <div className="progress-bar" style={{ width: `${ps.utilization}%`, background: ps.utilization > 70 ? '#dc3545' : '#198754' }}/>
                      </div>
                      <span className="small">{ps.utilization}%</span>
                    </div>
                  </div>
                )) : <div className="p-4 text-muted text-center">No port stats.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── IDS ── */}
      {activeKey === 'ids' && (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-danger text-white d-flex align-items-center gap-2">
                <i className="bi bi-shield-exclamation"/>
                <strong>IDS / Security</strong>
                {attackerAlerts.length > 0 && <span className="badge bg-light text-danger ms-auto">{attackerAlerts.length} Active</span>}
              </div>
              <div className="card-body">
                <p className="text-muted">IDS monitors all traffic. Attackers are auto-detected and blocked.</p>
                <div className="d-flex gap-2 mb-3">
                  <button className="btn btn-danger btn-sm" onClick={() => navigate('/alerts')}>Open IDS Alerts</button>
                </div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Attacker Alerts</span><span className={attackerAlerts.length>0?'text-danger fw-bold':''}>{attackerAlerts.length}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Auto-Blocked IPs</span><span>{blockedCount}</span></div>
                <div className="d-flex justify-content-between py-2"><span>Detection Rate</span><span className="text-success">Active</span></div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-warning text-dark"><strong>Recent Attacker Alerts</strong></div>
              <div className="card-body p-0">
                {attackerAlerts.length ? attackerAlerts.slice(0, 8).map(a => (
                  <div key={a.id} className="px-3 py-2 border-bottom" style={{ background: a.severity==='Critical' ? 'rgba(220,53,69,0.04)' : undefined }}>
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="fw-semibold small">{a.type}</div>
                      <span className={`badge ${a.severity==='Critical'?'bg-danger':'bg-warning text-dark'}`}>{a.severity}</span>
                    </div>
                    <div className="small text-muted">{a.source_host} → {a.destination_host}</div>
                  </div>
                )) : (
                  <div className="p-4 text-center text-success">
                    <i className="bi bi-shield-check fs-4 d-block mb-1"/>
                    <span className="small">No attacker alerts</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOGS ── */}
      {activeKey === 'logs' && (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-secondary text-white"><strong>Event Log</strong></div>
              <div className="card-body">
                <div className="d-flex justify-content-between border-bottom py-2"><span>Controller Events</span><span>{flows.length}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>IDS Events</span><span>{alerts.length}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Attack Events</span><span className={attackerAlerts.length>0?'text-danger fw-bold':''}>{attackerAlerts.length}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Blocked IPs</span><span>{blockedCount}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Last Update</span><span className="small text-muted">{status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : 'now'}</span></div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Performance</strong></div>
              <div className="card-body">
                <div className="d-flex justify-content-between border-bottom py-2"><span>Managed Hosts</span><span>{status?.hosts?.length || 0}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Managed Switches</span><span>{switchCount}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Installed Flows</span><span>{flows.length}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Total Alerts</span><span>{alerts.length}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Ping Events</span><span>{pingStats?.total_pings || 0}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ctrlPulse    { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes ctrlSlideIn  { from{transform:translateY(-20px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>
  );
}