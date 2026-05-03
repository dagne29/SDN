import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { controllerAPI, idsAPI, pingAPI, trafficAPI, topologyAPI } from '../services/api';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(raw) {
  const ms = Date.parse(raw || '') || 0;
  if (!ms) return '—';
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2,'0')).join(':');
}

function StatusBadge({ online, labels = ['Online','Offline'] }) {
  return (
    <span className={`badge ${online ? 'bg-success' : 'bg-danger'}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: '#fff',
        boxShadow: online ? '0 0 0 2px rgba(255,255,255,0.4)' : 'none',
        animation: online ? 'ctrlPulse 1.6s infinite' : 'none',
        display: 'inline-block'
      }} />
      {online ? labels[0] : labels[1]}
    </span>
  );
}

function MetricCard({ title, value, detail, accent = 'primary', icon }) {
  return (
    <div className="col-12 col-sm-6 col-xl-3">
      <div className="card h-100 shadow-sm">
        <div className="card-body">
          <div className="d-flex align-items-center gap-2 mb-1">
            {icon && <i className={`bi ${icon} text-${accent}`} />}
            <div className="text-muted small">{title}</div>
          </div>
          <div className={`fs-3 fw-bold text-${accent}`}>{value}</div>
          {detail && <div className="small text-muted">{detail}</div>}
        </div>
      </div>
    </div>
  );
}

// Mini bar chart for quick inline visuals
function MiniBar({ value, max, color = '#0d6efd' }) {
  const pct = max ? Math.max(4, Math.round((value / max) * 100)) : 4;
  return (
    <div className="progress mt-1" style={{ height: 5 }}>
      <div className="progress-bar" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// Attacker block panel
function AttackerPanel({ attackers, alerts, onBlock, onUnblock, blockedIPs }) {
  if (!attackers.length && !alerts.filter(a => (a.source_host||'').startsWith('atk_')).length) {
    return <div className="text-muted small py-3 text-center">No active attackers detected.</div>;
  }

  const attackerAlerts = alerts.filter(a =>
    (a.source_host || '').startsWith('atk_') ||
    (a.source_ip || '') in blockedIPs ||
    a.attack_detected
  );

  const sources = [...new Set([
    ...attackers.map(([id]) => id),
    ...attackerAlerts.map(a => a.source_host || a.source_ip).filter(Boolean)
  ])];

  return (
    <div className="d-flex flex-column gap-3">
      {sources.map(src => {
        const isBlocked = blockedIPs[src];
        const srcAlerts = attackerAlerts.filter(a => a.source_host === src || a.source_ip === src);
        return (
          <div key={src} className="rounded p-3 border"
            style={{ background: isBlocked ? 'rgba(239,68,68,0.05)' : 'rgba(253,224,71,0.07)', borderColor: isBlocked ? '#dc3545' : '#fde047' }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div>
                <span className="fw-bold" style={{ fontFamily: 'monospace' }}>{src}</span>
                {isBlocked && <span className="badge bg-danger ms-2" style={{ fontSize: 10 }}>BLOCKED</span>}
                {!isBlocked && <span className="badge bg-warning text-dark ms-2" style={{ fontSize: 10 }}>ACTIVE</span>}
              </div>
              <div className="d-flex gap-2">
                {!isBlocked ? (
                  <button className="btn btn-danger btn-sm" onClick={() => onBlock(src)}>
                    <i className="bi bi-shield-x me-1" />Block
                  </button>
                ) : (
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => onUnblock(src)}>
                    <i className="bi bi-shield-check me-1" />Unblock
                  </button>
                )}
              </div>
            </div>
            {srcAlerts.length > 0 && (
              <div className="small text-muted">
                {srcAlerts[0].type} — {srcAlerts[0].reason || 'No reason'}
                {srcAlerts.length > 1 && ` (+${srcAlerts.length - 1} more)`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Real-time event log
function EventLog({ events }) {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12, background: '#0b1220', color: '#e2e8f0', borderRadius: 8, padding: 14, maxHeight: 280, overflowY: 'auto' }}>
      {events.length === 0 && <span style={{ color: '#64748b' }}>No events yet. Waiting for activity...</span>}
      {events.map((ev, i) => (
        <div key={i} style={{ marginBottom: 4, color: ev.color || '#e2e8f0' }}>
          <span style={{ color: '#64748b', marginRight: 8 }}>{ev.time}</span>
          <span style={{ color: ev.type === 'attack' ? '#f87171' : ev.type === 'block' ? '#4ade80' : ev.type === 'flow' ? '#60a5fa' : '#e2e8f0' }}>
            [{ev.type?.toUpperCase() || 'INFO'}]
          </span>
          <span style={{ marginLeft: 6 }}>{ev.message}</span>
        </div>
      ))}
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
  const [refreshing, setRefreshing] = useState(false);
  const [blockedIPs, setBlockedIPs] = useState({});
  const [blockMessage, setBlockMessage] = useState('');
  const [eventLog, setEventLog] = useState([]);

  const addEvent = (type, message) => {
    const now = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2,'0')).join(':');
    setEventLog(prev => [{ type, message, time }, ...prev].slice(0, 80));
  };

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
      const newAlerts = alertsRes.data || [];
      const prevAlertIds = new Set(alerts.map(a => a.id));

      setStatus(statRes.data || {});
      setFlows(flowsRes.data || []);
      setSwitches(swRes.data || {});
      setPortStats(psRes.data || []);
      setAlerts(newAlerts);
      setTopologyHosts(hostsRes.data || {});
      setPingStats(pingStatsRes.data || null);

      // Log new alerts
      newAlerts.filter(a => !prevAlertIds.has(a.id)).forEach(a => {
        addEvent('attack', `${a.type} — ${a.source_host || a.source_ip} → ${a.destination_host || a.destination_ip} [${a.severity}]`);
      });

      setLoading(false);
    } catch (err) {
      console.error('Error fetching controller data', err);
    }
  };

  const handleBlock = async (host) => {
    try {
      await idsAPI.blockAlert(alerts.find(a => a.source_host === host || a.source_ip === host)?.id);
      setBlockedIPs(prev => ({ ...prev, [host]: true }));
      setBlockMessage(`✓ ${host} has been blocked.`);
      addEvent('block', `Blocked attacker: ${host}`);
      setTimeout(() => setBlockMessage(''), 4000);
    } catch {
      // Optimistic block even if API fails
      setBlockedIPs(prev => ({ ...prev, [host]: true }));
      setBlockMessage(`✓ ${host} flagged as blocked (controller may be offline).`);
      addEvent('block', `Locally blocked: ${host}`);
      setTimeout(() => setBlockMessage(''), 4000);
    }
  };

  const handleUnblock = (host) => {
    setBlockedIPs(prev => { const n = { ...prev }; delete n[host]; return n; });
    setBlockMessage(`${host} unblocked.`);
    addEvent('flow', `Unblocked: ${host}`);
    setTimeout(() => setBlockMessage(''), 3000);
  };

  const handleBlockAlert = async (alertId, action) => {
    try {
      if (action === 'block') await idsAPI.blockAlert(alertId);
      if (action === 'resolve') await idsAPI.resolveAlert(alertId);
      if (action === 'acknowledge') await idsAPI.acknowledgeAlert(alertId);
      addEvent(action === 'block' ? 'block' : 'flow', `Alert ${alertId} ${action}d`);
      await fetchAll();
    } catch (e) {
      console.error(e);
    }
  };

  const controllerOnline = status?.controller_connected === true;
  const topologyOnline   = status?.topology_running === true;
  const overallOnline    = controllerOnline && topologyOnline;

  const attackerHosts = Object.entries(topologyHosts).filter(([, d]) => (d.role || '').toLowerCase() === 'attacker');
  const activeAttackers = alerts.filter(a => (a.source_host || '').startsWith('atk_') || a.attack_detected);
  const blockedCount = Object.keys(blockedIPs).length + (alerts.filter(a => (a.status || '').toLowerCase() === 'blocked').length);
  const criticalAlerts = alerts.filter(a => a.severity === 'Critical');

  const swList = Object.entries(switches);
  const hostList = Object.entries(topologyHosts);

  if (loading) return (
    <div className="p-5 text-center">
      <div className="spinner-border text-primary" role="status" />
      <p className="mt-3">Loading controller status...</p>
    </div>
  );

  return (
    <div className="container-fluid p-4">
      {/* ── Header ── */}
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-4">
        <div>
          <h2 className="mb-1 d-flex align-items-center gap-2">
            <i className="bi bi-hdd-network" />
            Controller
            <StatusBadge online={overallOnline} />
          </h2>
          <p className="text-muted mb-0">
            Overall SDN activity control — monitors switches, hosts, flows, and auto-blocks attackers detected by IDS.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted small">
            {flows.length} flows · {alerts.length} alerts · {swList.length} switches · {hostList.length} hosts
          </span>
          <button type="button" className="btn btn-sm btn-outline-secondary"
            onClick={async () => { setRefreshing(true); await fetchAll(); setRefreshing(false); }}
            disabled={refreshing}>
            <i className="bi bi-arrow-clockwise me-1" />Refresh
          </button>
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {activeKey === 'overview' && (
        <>
          <div className="row g-3 mb-4">
            <MetricCard title="System Status"   value={overallOnline ? 'Online' : 'Offline'} detail="Controller + Topology" accent={overallOnline ? 'success' : 'danger'} icon="bi-activity" />
            <MetricCard title="Managed Switches" value={swList.length}  detail="OVS switches connected" accent="primary"  icon="bi-hdd-stack" />
            <MetricCard title="Active Attackers" value={activeAttackers.length} detail="IDS-detected threats" accent="danger"  icon="bi-shield-exclamation" />
            <MetricCard title="Blocked Sources"  value={blockedCount}   detail="Currently blocked IPs"   accent="dark"    icon="bi-shield-x" />
          </div>

          {/* Live control snapshot */}
          <div className="row g-4">
            <div className="col-12 col-xl-5">
              <div className="card h-100 shadow-sm">
                <div className="card-header d-flex align-items-center gap-2" style={{ background: '#0f172a', color: '#fff' }}>
                  <i className="bi bi-cpu" />
                  <strong>System Control Snapshot</strong>
                </div>
                <div className="card-body p-0">
                  {[
                    { label: 'Ryu Controller',    val: <StatusBadge online={controllerOnline} labels={['Connected','Disconnected']} /> },
                    { label: 'Mininet Topology',  val: <StatusBadge online={topologyOnline}  labels={['Running','Stopped']} /> },
                    { label: 'Flow Entries',       val: flows.length },
                    { label: 'Ping Events',        val: pingStats?.total_pings || 0 },
                    { label: 'IDS Alerts',         val: alerts.length },
                    { label: 'Critical Alerts',    val: <span className="text-danger fw-bold">{criticalAlerts.length}</span> },
                    { label: 'Auto-Blocking',      val: <span className="badge bg-warning text-dark">Active</span> },
                    { label: 'Blocked IPs',        val: blockedCount },
                  ].map(({ label, val }) => (
                    <div key={label} className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                      <span className="text-muted small">{label}</span>
                      <span>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="col-12 col-xl-7">
              <div className="card h-100 shadow-sm">
                <div className="card-header d-flex align-items-center gap-2 bg-danger text-white">
                  <i className="bi bi-shield-exclamation" />
                  <strong>Active Attacker Control</strong>
                  {activeAttackers.length > 0 && (
                    <span className="badge bg-light text-danger ms-auto">{activeAttackers.length} active</span>
                  )}
                </div>
                <div className="card-body">
                  {blockMessage && <div className="alert alert-success py-2 mb-3">{blockMessage}</div>}
                  <AttackerPanel
                    attackers={attackerHosts}
                    alerts={alerts}
                    onBlock={handleBlock}
                    onUnblock={handleUnblock}
                    blockedIPs={blockedIPs}
                  />
                </div>
              </div>
            </div>

            <div className="col-12">
              <div className="card shadow-sm">
                <div className="card-header d-flex align-items-center gap-2" style={{ background: '#0b1220', color: '#60a5fa' }}>
                  <i className="bi bi-terminal" />
                  <strong style={{ color: '#fff' }}>Real-Time Event Log</strong>
                  <span className="badge ms-auto" style={{ background: '#1e3a5f', color: '#60a5fa', fontSize: 10 }}>
                    {eventLog.length} events
                  </span>
                </div>
                <div className="card-body p-2">
                  <EventLog events={eventLog} />
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
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white d-flex align-items-center gap-2">
                <i className="bi bi-activity" /><strong>Network Status</strong>
              </div>
              <div className="card-body p-0">
                {[
                  { label: 'Controller Connected', val: <StatusBadge online={controllerOnline} /> },
                  { label: 'Topology Running',     val: <StatusBadge online={topologyOnline} labels={['Running','Stopped']} /> },
                  { label: 'Flow Count',           val: status?.flow_count || flows.length },
                  { label: 'Alert Count',          val: alerts.length },
                  { label: 'Blocked Sources',      val: blockedCount },
                  { label: 'OVS Switches',         val: swList.length },
                  { label: 'Hosts Registered',     val: hostList.length },
                ].map(({ label, val }) => (
                  <div key={label} className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                    <span className="small text-muted">{label}</span><span>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-primary text-white d-flex align-items-center gap-2">
                <i className="bi bi-bar-chart" /><strong>Activity Metrics</strong>
              </div>
              <div className="card-body">
                {[
                  { label: 'Ping Events',  val: pingStats?.total_pings || 0,  max: 200, color: '#0d6efd' },
                  { label: 'Flows',        val: flows.length,                  max: 100, color: '#198754' },
                  { label: 'Alerts',       val: alerts.length,                 max: 50,  color: '#dc3545' },
                  { label: 'Port Samples', val: portStats.length,              max: 20,  color: '#fd7e14' },
                ].map(({ label, val, max, color }) => (
                  <div key={label} className="mb-3">
                    <div className="d-flex justify-content-between small mb-1">
                      <span className="text-muted">{label}</span>
                      <span className="fw-semibold">{val}</span>
                    </div>
                    <MiniBar value={val} max={max} color={color} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SWITCHES ── */}
      {activeKey === 'switches' && (
        <div className="row g-4">
          <div className="col-12 col-xl-7">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-primary text-white d-flex align-items-center gap-2">
                <i className="bi bi-hdd-stack" /><strong>OVS Switches</strong>
                <span className="badge bg-light text-dark ms-auto">{swList.length}</span>
              </div>
              <div className="card-body p-0">
                {swList.length ? swList.map(([sid, sw]) => (
                  <div key={sid} className="d-flex justify-content-between align-items-center px-3 py-3 border-bottom">
                    <div>
                      <div className="fw-semibold">{sid}
                        {sw.name && sw.name !== sid && <span className="text-muted ms-2 small">({sw.name})</span>}
                      </div>
                      <div className="small text-muted">
                        IP: {sw.ip || '—'} · Ports: {sw.ports || (sw.port_stats ? Object.keys(sw.port_stats).length : '—')}
                      </div>
                    </div>
                    <span className={`badge ${(sw.status || 'online') === 'online' ? 'bg-success' : 'bg-warning text-dark'}`}>
                      {sw.status || 'online'}
                    </span>
                  </div>
                )) : (
                  <div className="p-4 text-center text-muted">No switches registered yet.</div>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-5">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white d-flex align-items-center gap-2">
                <i className="bi bi-pc-display" /><strong>Hosts</strong>
                <span className="badge bg-secondary ms-auto">{hostList.length}</span>
              </div>
              <div className="card-body p-0">
                {hostList.length ? hostList.map(([hid, host]) => (
                  <div key={hid} className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                    <div>
                      <div className="fw-semibold" style={{ fontFamily: 'monospace', fontSize: 13 }}>{host.name || hid}</div>
                      <div className="small text-muted">{host.ip || '—'}</div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span className={`badge ${host.role === 'attacker' ? 'bg-danger' : host.role === 'router' ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                        {host.role || 'host'}
                      </span>
                      {blockedIPs[hid] && <span className="badge bg-dark">Blocked</span>}
                    </div>
                  </div>
                )) : (
                  <div className="p-4 text-center text-muted">No hosts available.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FLOWS ── */}
      {activeKey === 'flows' && (
        <div className="row g-4">
          <div className="col-12 col-xl-5">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white d-flex align-items-center gap-2">
                <i className="bi bi-diagram-2" /><strong>Flow Table</strong>
                <span className="badge bg-secondary ms-auto">{flows.length}</span>
              </div>
              <div className="card-body p-0" style={{ maxHeight: 480, overflowY: 'auto' }}>
                {flows.slice().reverse().slice(0, 20).map(flow => (
                  <button key={flow.id} type="button"
                    className="list-group-item list-group-item-action border-bottom px-3 py-2"
                    onClick={() => navigate(`/flows/${flow.id}`)}>
                    <div className="d-flex justify-content-between">
                      <span className="fw-semibold small" style={{ fontFamily: 'monospace' }}>{flow.id}</span>
                      <span className="badge bg-secondary">{flow.protocol || 'ICMP'}</span>
                    </div>
                    <div className="small text-muted">{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</div>
                  </button>
                ))}
                {!flows.length && <div className="p-4 text-center text-muted">No flows yet.</div>}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-7">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-primary text-white"><strong>Flow Details</strong></div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-sm table-hover">
                    <thead className="table-light">
                      <tr><th>ID</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Bytes</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {flows.slice().reverse().slice(0, 15).map(flow => (
                        <tr key={flow.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/flows/${flow.id}`)}>
                          <td><code style={{ fontSize: 11 }}>{flow.id?.slice(0, 8)}…</code></td>
                          <td>{flow.src_host || flow.src_ip || '—'}</td>
                          <td>{flow.dst_host || flow.dst_ip || '—'}</td>
                          <td><span className="badge bg-secondary">{flow.protocol || 'ICMP'}</span></td>
                          <td>{flow.bytes || 0}</td>
                          <td><span className={`badge ${flow.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>{flow.status || '—'}</span></td>
                        </tr>
                      ))}
                      {!flows.length && <tr><td colSpan="6" className="text-center text-muted">No flows yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <button className="btn btn-primary btn-sm mt-2" onClick={() => navigate('/controller/flows')}>
                  Open Full Flow Manager
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TRAFFIC ── */}
      {activeKey === 'traffic' && (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-success text-white"><strong>Traffic Control</strong></div>
              <div className="card-body">
                <p className="text-muted">Use the Traffic hub for live flow monitoring, ping tests, analysis, and filters.</p>
                <button className="btn btn-success btn-sm" onClick={() => navigate('/traffic')}>
                  Open Traffic Hub
                </button>
                <button className="btn btn-outline-primary btn-sm ms-2" onClick={() => navigate('/traffic/analyzer')}>
                  Open Analyzer
                </button>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white"><strong>Port Statistics</strong></div>
              <div className="card-body p-0">
                {portStats.length ? portStats.map(ps => (
                  <div key={ps.switch} className="px-3 py-2 border-bottom">
                    <div className="d-flex justify-content-between small mb-1">
                      <span className="fw-semibold">{ps.switch}</span>
                      <span>{ps.utilization}%</span>
                    </div>
                    <MiniBar value={ps.utilization} max={100} color={ps.utilization > 80 ? '#dc3545' : ps.utilization > 50 ? '#fd7e14' : '#198754'} />
                  </div>
                )) : (
                  <div className="p-4 text-center text-muted">No port stats available.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── IDS ── */}
      {activeKey === 'ids' && (
        <div className="row g-4">
          {blockMessage && (
            <div className="col-12">
              <div className="alert alert-success py-2">{blockMessage}</div>
            </div>
          )}
          <div className="col-12 col-xl-5">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-danger text-white d-flex align-items-center gap-2">
                <i className="bi bi-shield-exclamation" /><strong>IDS / Security Control</strong>
              </div>
              <div className="card-body">
                <AttackerPanel
                  attackers={attackerHosts}
                  alerts={alerts}
                  onBlock={handleBlock}
                  onUnblock={handleUnblock}
                  blockedIPs={blockedIPs}
                />
                <div className="mt-3">
                  <button className="btn btn-danger btn-sm" onClick={() => navigate('/alerts')}>
                    Open Full IDS Alerts
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-7">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-warning text-dark"><strong>Recent Alerts</strong></div>
              <div className="card-body p-0" style={{ maxHeight: 440, overflowY: 'auto' }}>
                {alerts.slice().reverse().slice(0, 15).map(alert => (
                  <div key={alert.id} className="px-3 py-2 border-bottom d-flex justify-content-between align-items-start gap-2">
                    <div>
                      <div className="fw-semibold small">{alert.type}</div>
                      <div className="small text-muted">{alert.source_host} → {alert.destination_host}</div>
                      <div className="small text-muted">{alert.reason?.slice(0, 60) || '—'}</div>
                    </div>
                    <div className="d-flex flex-column gap-1 align-items-end">
                      <span className={`badge bg-${alert.severity === 'Critical' ? 'danger' : alert.severity === 'High' ? 'warning text-dark' : 'secondary'}`}>
                        {alert.severity}
                      </span>
                      <div className="d-flex gap-1">
                        <button className="btn btn-danger btn-sm py-0" style={{ fontSize: 11 }}
                          onClick={() => handleBlockAlert(alert.id, 'block')}>Block</button>
                        <button className="btn btn-success btn-sm py-0" style={{ fontSize: 11 }}
                          onClick={() => handleBlockAlert(alert.id, 'resolve')}>Resolve</button>
                      </div>
                    </div>
                  </div>
                ))}
                {!alerts.length && <div className="p-4 text-center text-muted">No alerts yet.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOGS ── */}
      {activeKey === 'logs' && (
        <div className="row g-4">
          <div className="col-12 col-xl-5">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-secondary text-white"><strong>Performance Summary</strong></div>
              <div className="card-body p-0">
                {[
                  { label: 'Managed Hosts',    val: hostList.length },
                  { label: 'Managed Switches', val: swList.length },
                  { label: 'Installed Flows',  val: status?.flow_count || flows.length },
                  { label: 'Active Alerts',    val: status?.alert_count || alerts.length },
                  { label: 'Ping Events',      val: pingStats?.total_pings || 0 },
                  { label: 'Attack Pings',     val: pingStats?.attack_pings || 0 },
                  { label: 'Last Updated',     val: formatTime(status?.timestamp) },
                ].map(({ label, val }) => (
                  <div key={label} className="d-flex justify-content-between px-3 py-2 border-bottom">
                    <span className="small text-muted">{label}</span><span className="fw-semibold">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-7">
            <div className="card h-100 shadow-sm">
              <div className="card-header d-flex align-items-center gap-2" style={{ background: '#0b1220', color: '#60a5fa' }}>
                <i className="bi bi-terminal" />
                <strong style={{ color: '#fff' }}>Event Log</strong>
              </div>
              <div className="card-body p-2">
                <EventLog events={eventLog} />
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ctrlPulse {
          0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.6); }
          70% { box-shadow: 0 0 0 5px rgba(255,255,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
        }
      `}</style>
    </div>
  );
}