import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { idsAPI, pingAPI } from '../services/api';

const severityOptions = ['all', 'Critical', 'High', 'Medium', 'Low'];
const statusOptions = ['all', 'new', 'acknowledged', 'blocked', 'resolved'];

function SeverityBadge({ severity }) {
  const color = {
    Critical: 'danger',
    High: 'warning',
    Medium: 'info',
    Low: 'secondary',
  }[severity] || 'dark';

  return <span className={`badge bg-${color}`}>{severity || 'Unknown'}</span>;
}

function StatusBadge({ status }) {
  const color = {
    new: 'danger',
    acknowledged: 'warning text-dark',
    blocked: 'dark',
    resolved: 'success',
  }[(status || 'new').toLowerCase()] || 'secondary';

  return <span className={`badge bg-${color}`}>{status || 'new'}</span>;
}

function PingStatusBadge({ status }) {
  const normalized = (status || 'unknown').toLowerCase();
  const color = {
    success: 'success',
    failed: 'danger',
    degraded: 'warning text-dark',
    unknown: 'secondary',
  }[normalized] || 'secondary';
  return <span className={`badge bg-${color}`}>{normalized}</span>;
}

function summarizePingOutput(output) {
  const text = (output || '').trim();
  if (!text) return '';
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const interesting = lines.find((line) => /Destination Host Unreachable/i.test(line))
    || lines.find((line) => /packet loss/i.test(line))
    || lines[lines.length - 1];
  return interesting || '';
}

export default function IDSAlerts() {
  const location = useLocation();
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [rules, setRules] = useState([]);
  const [recentPings, setRecentPings] = useState([]);
  const [attackPings, setAttackPings] = useState([]);
  const [latestPing, setLatestPing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [historyLimit, setHistoryLimit] = useState(10);
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    fetchAlertsData();
    const interval = setInterval(fetchAlertsData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAlertsData = async () => {
    let nextAlerts = [];
    try {
      const [alertsRes, statsRes, rulesRes] = await Promise.all([
        idsAPI.getAlerts(100),
        idsAPI.getStatistics(),
        idsAPI.getRules(),
      ]);
      nextAlerts = alertsRes.data || [];
      setAlerts(nextAlerts);
      setStats(statsRes.data || null);
      setRules(rulesRes.data || []);
      setSelectedAlertId((current) => current || nextAlerts[0]?.id || null);
    } catch (error) {
      console.error('Error fetching IDS data:', error);
      setActionMessage('Unable to load IDS data. Is the backend running on port 5000?');
    }

    try {
      const [pingsRes, latestPingRes] = await Promise.all([
        pingAPI.getAll({ limit: 100 }),
        pingAPI.getLatest(),
      ]);
      const nextPings = pingsRes.data || [];
      setRecentPings(nextPings);
      setAttackPings(nextPings.filter((ping) => Boolean(ping?.attack_detected)));
      setLatestPing(latestPingRes.data || null);
    } catch (error) {
      console.error('Error fetching ping events:', error);
      setRecentPings([]);
      setAttackPings([]);
      setLatestPing(null);
      setActionMessage('Unable to load ping events. Check `/api/pings` and `/api/pings/ingest` on the backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchAlertsData();
    } finally {
      setRefreshing(false);
    }
  };

  const selectedAlert = useMemo(
    () => alerts.find((alert) => alert.id === selectedAlertId) || alerts[0] || null,
    [alerts, selectedAlertId]
  );

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const severityMatch = severityFilter === 'all' || alert.severity === severityFilter;
      const statusMatch = statusFilter === 'all' || (alert.status || 'new').toLowerCase() === statusFilter;
      return severityMatch && statusMatch;
    });
  }, [alerts, severityFilter, statusFilter]);

  const counts = useMemo(() => {
    return alerts.reduce((acc, alert) => {
      const severity = alert.severity || 'Unknown';
      const status = (alert.status || 'new').toLowerCase();
      acc.severity[severity] = (acc.severity[severity] || 0) + 1;
      acc.status[status] = (acc.status[status] || 0) + 1;
      return acc;
    }, { severity: {}, status: {} });
  }, [alerts]);

  const updateAlertStatus = async (alertId, action) => {
    if (!alertId) return;
    try {
      if (action === 'block') await idsAPI.blockAlert(alertId);
      if (action === 'clear') await idsAPI.clearAlert(alertId);
      if (action === 'acknowledge') await idsAPI.acknowledgeAlert(alertId);
      if (action === 'resolve') await idsAPI.resolveAlert(alertId);

      const label = {
        block: 'blocked',
        clear: 'cleared',
        acknowledge: 'acknowledged',
        resolve: 'resolved',
      }[action] || action;

      setActionMessage(`Alert ${alertId} ${label}.`);
      fetchAlertsData();
    } catch (error) {
      console.error(`Error performing ${action} on alert`, error);
      setActionMessage(`Unable to ${action} alert ${alertId}.`);
    }
  };
  

  const historyItems = filteredAlerts.slice().reverse().slice(0, historyLimit);
  const activeCount = counts.status.new || 0;
  const blockedCount = counts.status.blocked || 0;
  const resolvedCount = counts.status.resolved || 0;
  const criticalCount = counts.severity.Critical || 0;
  const activeSection = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get('section') || 'overview';
    const allowed = new Set(['overview', 'list', 'details', 'severity', 'status', 'actions', 'filters', 'history']);
    return allowed.has(value) ? value : 'overview';
  }, [location.search]);

  if (loading) return <div className="p-5 text-center">Loading alerts...</div>;

  return (
    <div className="container-fluid p-4">
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3">
        <div>
          <h2 className="mb-1">IDS Alerts</h2>
          <p className="text-muted mb-0">Controller-style alert management for attack info, details, severity, status, actions, filters, and history.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="text-muted small">
            {alerts.length} alerts total, {stats?.blocked_sources || 0} blocked sources, {stats?.detection_rate || '0%'} detection rate
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleRefresh} disabled={refreshing}>
            <i className="bi bi-arrow-clockwise me-1" /> Refresh
          </button>
        </div>
      </div>

      <div className="row g-4 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="card h-100 border-danger shadow-sm">
              <div className="card-body">
                <div className="text-muted small">Total Alerts</div>
                <div className="fs-3 fw-bold text-danger">{stats?.total_alerts || alerts.length}</div>
                <div className="small text-muted">All detected incidents</div>
              </div>
            </div>
          </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100 border-dark shadow-sm">
            <div className="card-body">
              <div className="text-muted small">Critical</div>
              <div className="fs-3 fw-bold text-dark">{stats?.critical_alerts || criticalCount}</div>
              <div className="small text-muted">Highest-priority threats</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100 border-warning shadow-sm">
            <div className="card-body">
              <div className="text-muted small">Active</div>
              <div className="fs-3 fw-bold text-warning">{activeCount}</div>
              <div className="small text-muted">New or unhandled alerts</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100 border-info shadow-sm">
            <div className="card-body">
              <div className="text-muted small">Resolved</div>
              <div className="fs-3 fw-bold text-info">{resolvedCount}</div>
              <div className="small text-muted">Closed incidents</div>
            </div>
          </div>
        </div>
      </div>

      {actionMessage ? <div className="alert alert-info py-2">{actionMessage}</div> : null}
      {!actionMessage && !latestPing && !recentPings.length ? (
        <div className="alert alert-warning py-2">
          No ping events received yet. If you ran pings in Mininet, confirm the Flask API is reachable at <code>http://localhost:5000/api/health</code>.
        </div>
      ) : null}

      {activeSection === 'overview' ? (
        <div className="row g-4">
          <div className="col-12 col-lg-6">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white"><strong>Alert Summary</strong></div>
              <div className="card-body">
                <div className="d-flex justify-content-between border-bottom py-2"><span>New</span><span>{counts.status.new || 0}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Acknowledged</span><span>{counts.status.acknowledged || 0}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Blocked</span><span>{counts.status.blocked || 0}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Resolved</span><span>{counts.status.resolved || 0}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Recent Pings</span><span>{recentPings.length}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Attack Pings</span><span>{attackPings.length}</span></div>
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-6">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-danger text-white"><strong>Latest Case</strong></div>
              <div className="card-body">
                {selectedAlert ? (
                  <>
                    <div className="fw-semibold">{selectedAlert.type}</div>
                    <div className="small text-muted">{selectedAlert.source_host} → {selectedAlert.destination_host}</div>
                    <div className="mt-3">
                      <SeverityBadge severity={selectedAlert.severity} />
                      <span className="mx-2" />
                      <StatusBadge status={selectedAlert.status} />
                    </div>
                    <p className="mt-3 mb-0">{selectedAlert.reason || 'No reason provided.'}</p>
                  </>
                ) : (
                  <p className="text-muted mb-0">No alerts available.</p>
                )}
              </div>
            </div>
          </div>
          <div className="col-12">
            <div className="card shadow-sm">
              <div className="card-header bg-primary text-white"><strong>Latest Ping Request</strong></div>
              <div className="card-body">
                {latestPing && (latestPing.src_host || latestPing.src || latestPing.dst_host || latestPing.dst) ? (
                  <div className="d-flex flex-column flex-md-row justify-content-between gap-2">
                    <div>
                      <div className="fw-semibold">
                        {latestPing.src_host || latestPing.src || '—'} → {latestPing.dst_host || latestPing.dst || '—'}
                      </div>
                      <div className="small text-muted">
                        {latestPing.status || 'unknown'} • {latestPing.round_trip_time || (latestPing.latency_ms != null ? `${latestPing.latency_ms} ms` : '—')} • {latestPing.timestamp || '—'}
                      </div>
                    </div>
                    <div className="text-muted small">
                      <code>{latestPing.command || 'ping'}</code>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted">No ping requests yet.</div>
                )}
                {!latestPing && !recentPings.length ? (
                  <div className="mt-2 small text-muted">
                    Mininet ping events show up here only after the Flask API is running on <code>http://localhost:5000</code>.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === 'list' ? (
        <div className="row g-4">
          <div className="col-12 col-xl-5">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
                <strong>Alert List</strong>
                <span className="badge bg-light text-dark">{filteredAlerts.length}</span>
              </div>
              <div className="card-body border-bottom">
                <p className="text-muted mb-3">Attack info appears here. Pick an alert to load the details panel on the right.</p>
                <div className="list-group" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
                  {filteredAlerts.length ? filteredAlerts.map((alert) => (
                    <button
                      key={alert.id}
                      type="button"
                      className={`list-group-item list-group-item-action ${selectedAlert?.id === alert.id ? 'active' : ''}`}
                      onClick={() => setSelectedAlertId(alert.id)}
                      style={{ textAlign: 'left' }}
                    >
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <div>
                          <div className="fw-semibold">{alert.type}</div>
                          <div className="small opacity-75">{alert.source_host} → {alert.destination_host}</div>
                        </div>
                        <SeverityBadge severity={alert.severity} />
                      </div>
                      <div className="d-flex justify-content-between align-items-center mt-2">
                        <StatusBadge status={alert.status} />
                        <small className="opacity-75">{new Date(alert.timestamp).toLocaleString()}</small>
                      </div>
                    </button>
                  )) : (
                    <div className="p-4 text-center text-muted">No alerts for this filter</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-7">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-danger text-white"><strong>Alert Details</strong></div>
              <div className="card-body">
                {selectedAlert ? (
                  <table className="table table-borderless mb-0">
                    <tbody>
                      <tr><th style={{ width: 180 }}>Alert ID</th><td>{selectedAlert.id}</td></tr>
                      <tr><th>Type</th><td>{selectedAlert.type}</td></tr>
                      <tr><th>Severity</th><td><SeverityBadge severity={selectedAlert.severity} /></td></tr>
                      <tr><th>Status</th><td><StatusBadge status={selectedAlert.status} /></td></tr>
                      <tr><th>Source Host</th><td>{selectedAlert.source_host}</td></tr>
                      <tr><th>Source IP</th><td>{selectedAlert.source_ip}</td></tr>
                      <tr><th>Destination Host</th><td>{selectedAlert.destination_host}</td></tr>
                      <tr><th>Destination IP</th><td>{selectedAlert.destination_ip}</td></tr>
                      <tr><th>Reason</th><td>{selectedAlert.reason || '—'}</td></tr>
                      <tr><th>Timestamp</th><td>{selectedAlert.timestamp}</td></tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="text-muted mb-0">Select an alert from the left list to view details.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === 'details' ? (
        <div className="row g-4">
          <div className="col-12 col-lg-7">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-danger text-white"><strong>Alert Details</strong></div>
              <div className="card-body">
                {selectedAlert ? (
                  <table className="table table-borderless mb-0">
                    <tbody>
                      <tr><th style={{ width: 180 }}>Alert ID</th><td>{selectedAlert.id}</td></tr>
                      <tr><th>Type</th><td>{selectedAlert.type}</td></tr>
                      <tr><th>Severity</th><td><SeverityBadge severity={selectedAlert.severity} /></td></tr>
                      <tr><th>Status</th><td><StatusBadge status={selectedAlert.status} /></td></tr>
                      <tr><th>Source Host</th><td>{selectedAlert.source_host}</td></tr>
                      <tr><th>Source IP</th><td>{selectedAlert.source_ip}</td></tr>
                      <tr><th>Destination Host</th><td>{selectedAlert.destination_host}</td></tr>
                      <tr><th>Destination IP</th><td>{selectedAlert.destination_ip}</td></tr>
                      <tr><th>Reason</th><td>{selectedAlert.reason || '—'}</td></tr>
                      <tr><th>Timestamp</th><td>{selectedAlert.timestamp}</td></tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="text-muted mb-0">Select an alert to view details.</p>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-5">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white"><strong>Actions</strong></div>
              <div className="card-body">
                {selectedAlert ? (
                  <>
                    <p className="text-muted">Control alert <code>{selectedAlert.id}</code></p>
                    <div className="d-flex flex-wrap gap-2">
                      <button className="btn btn-dark" onClick={() => updateAlertStatus(selectedAlert.id, 'block')}>Block</button>
                      <button className="btn btn-success" onClick={() => updateAlertStatus(selectedAlert.id, 'clear')}>Clear</button>
                      <button className="btn btn-outline-warning" onClick={() => updateAlertStatus(selectedAlert.id, 'acknowledge')}>Acknowledge</button>
                      <button className="btn btn-outline-secondary" onClick={() => updateAlertStatus(selectedAlert.id, 'resolve')}>Resolve</button>
                    </div>
                  </>
                ) : (
                  <p className="text-muted mb-0">Pick an alert before using actions.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === 'severity' ? (
        <div className="row g-4">
          {severityOptions.filter((item) => item !== 'all').map((severity) => (
            <div className="col-12 col-sm-6 col-xl-3" key={severity}>
              <div className={`card h-100 shadow-sm border-${{
                Critical: 'dark',
                High: 'warning',
                Medium: 'info',
                Low: 'secondary',
              }[severity] || 'secondary'}`}>
                <div className="card-body text-center">
                  <div className="text-muted small">{severity}</div>
                  <div className={`fs-3 fw-bold text-${{
                    Critical: 'dark',
                    High: 'warning',
                    Medium: 'info',
                    Low: 'secondary',
                  }[severity] || 'secondary'}`}>{counts.severity[severity] || 0}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeSection === 'status' ? (
        <div className="row g-4">
          <div className="col-12 col-lg-6">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-warning text-dark"><strong>Status</strong></div>
              <div className="card-body">
                <div className="d-flex justify-content-between border-bottom py-2"><span>Active</span><span>{activeCount}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Acknowledged</span><span>{counts.status.acknowledged || 0}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Blocked</span><span>{blockedCount}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Resolved</span><span>{resolvedCount}</span></div>
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-6">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white"><strong>Severity Levels</strong></div>
              <div className="card-body">
                {severityOptions.filter((item) => item !== 'all').map((severity) => (
                  <div key={severity} className="d-flex justify-content-between border-bottom py-2">
                    <span>{severity}</span>
                    <span>{counts.severity[severity] || 0}</span>
                  </div>
                ))}
                <div className="d-flex justify-content-between pt-2">
                  <span>Attack Pings</span>
                  <span>{attackPings.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === 'actions' ? (
        <div className="row g-4">
          <div className="col-12 col-lg-6">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white"><strong>Actions</strong></div>
              <div className="card-body">
                {selectedAlert ? (
                  <>
                    <p className="text-muted">Selected alert: <code>{selectedAlert.id}</code></p>
                    <div className="d-flex flex-wrap gap-2">
                      <button className="btn btn-dark" onClick={() => updateAlertStatus(selectedAlert.id, 'block')}>Block</button>
                      <button className="btn btn-success" onClick={() => updateAlertStatus(selectedAlert.id, 'clear')}>Clear</button>
                    </div>
                  </>
                ) : (
                  <p className="text-muted mb-0">Select an alert before using actions.</p>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-6">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-warning text-dark"><strong>Attack Status</strong></div>
              <div className="card-body">
                <div className="d-flex justify-content-between border-bottom py-2"><span>Active</span><span>{activeCount}</span></div>
                <div className="d-flex justify-content-between border-bottom py-2"><span>Blocked</span><span>{blockedCount}</span></div>
                <div className="d-flex justify-content-between pt-2"><span>Resolved</span><span>{resolvedCount}</span></div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === 'filters' ? (
        <div className="row g-4">
          <div className="col-12 col-lg-4">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-danger text-white"><strong>Filters</strong></div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label">Severity</label>
                  <select className="form-select" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
                    {severityOptions.map((severity) => (
                      <option key={severity} value={severity}>{severity === 'all' ? 'All severities' : severity}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    setSeverityFilter('all');
                    setStatusFilter('all');
                  }}
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-8">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white"><strong>Filtered Alerts</strong></div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Alert</th>
                        <th>Severity</th>
                        <th>Status</th>
                        <th>Source</th>
                        <th>Destination</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAlerts.length ? filteredAlerts.map((alert) => (
                        <tr key={alert.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedAlertId(alert.id)}>
                          <td>{alert.type}</td>
                          <td><SeverityBadge severity={alert.severity} /></td>
                          <td><StatusBadge status={alert.status} /></td>
                          <td>{alert.source_host} ({alert.source_ip})</td>
                          <td>{alert.destination_host} ({alert.destination_ip})</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="5" classNa
                          me="text-center text-muted py-3">No alerts for this filter</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === 'history' ? (
        <div className="row g-4">
          <div className="col-12 col-lg-7">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-dark text-white"><strong>History</strong></div>
              <div className="card-body">
                <label className="form-label">Items shown</label>
                <input
                  type="range"
                  className="form-range"
                  min="5"
                  max="50"
                  step="1"
                  value={historyLimit}
                  onChange={(e) => setHistoryLimit(Number(e.target.value))}
                />
                <div className="small text-muted mb-3">{historyLimit} recent alerts</div>
                <div className="list-group">
                  {historyItems.map((alert) => (
                    <button
                      key={alert.id}
                      type="button"
                      className="list-group-item list-group-item-action"
                      onClick={() => setSelectedAlertId(alert.id)}
                    >
                      <div className="d-flex justify-content-between">
                        <strong>{alert.type}</strong>
                        <StatusBadge status={alert.status} />
                      </div>
                      <div className="small text-muted">{alert.source_host} → {alert.destination_host}</div>
                      <div className="small text-muted">{alert.timestamp}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-5">
            <div className="card h-100 shadow-sm">
              <div className="card-header bg-secondary text-white"><strong>Rules Snapshot</strong></div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Rule ID</th>
                        <th>Rule Name</th>
                        <th>Hits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule) => (
                        <tr key={rule.id}>
                          <td>{rule.id}</td>
                          <td>{rule.name}</td>
                          <td>{rule.hits}</td>
                        </tr>
                      ))}
                      {!rules.length ? (
                        <tr>
                          <td colSpan="3" className="text-center text-muted py-3">No rules available</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-top">
                  <div className="fw-semibold mb-2">Ping Feed</div>
                  {recentPings.slice().reverse().slice(0, 8).map((ping) => (
                    <div key={ping.id} className="border-bottom py-2">
                      <div className="d-flex justify-content-between align-items-center gap-2">
                        <div className="small fw-semibold">{ping.src_host} → {ping.dst_host}</div>
                        <PingStatusBadge status={ping.status} />
                      </div>
                      <div className="small text-muted">{ping.command}</div>
                      {ping.attack_detected ? <div className="small text-danger">Attack detected</div> : null}
                      {ping.packet_loss_pct != null ? (
                        <div className="small text-muted">Loss: {ping.packet_loss_pct}%</div>
                      ) : null}
                      {ping.output ? (
                        <div className="small text-muted">{summarizePingOutput(ping.output)}</div>
                      ) : null}
                    </div>
                  ))}
                  {!recentPings.length ? <div className="text-muted small">No ping events seen yet.</div> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
