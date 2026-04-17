import React, { useState, useEffect } from 'react';
import { idsAPI } from '../services/api';

export default function IDSAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchAlertsData();
    const interval = setInterval(fetchAlertsData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAlertsData = async () => {
    try {
      const [alertsRes, statsRes, rulesRes] = await Promise.all([
        idsAPI.getAlerts(),
        idsAPI.getStatistics(),
        idsAPI.getRules()
      ]);
      setAlerts(alertsRes.data);
      setStats(statsRes.data);
      setRules(rulesRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'Critical': return 'danger';
      case 'High': return 'warning';
      case 'Medium': return 'info';
      case 'Low': return 'secondary';
      default: return 'gray';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'new': return 'badge bg-danger';
      case 'acknowledged': return 'badge bg-warning';
      case 'resolved': return 'badge bg-success';
      default: return 'badge bg-secondary';
    }
  };

  const filteredAlerts = filter === 'all' ? alerts : alerts.filter((a) => a.severity === filter);

  if (loading) return <div className="p-5 text-center">Loading alerts...</div>;

  return (
    <div className="container-fluid p-4">
      <h2 className="mb-4">IDS - Intrusion Detection System</h2>
      
      {/* Stats Cards */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-danger">
            <div className="card-body text-center">
              <h6 className="text-muted">Total Alerts</h6>
              <h4 className="text-danger">{stats?.total_alerts || 0}</h4>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-dark">
            <div className="card-body text-center">
              <h6 className="text-muted">Critical</h6>
              <h4 className="text-dark">{stats?.critical_alerts || 0}</h4>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-warning">
            <div className="card-body text-center">
              <h6 className="text-muted">High Severity</h6>
              <h4 className="text-warning">{stats?.high_alerts || 0}</h4>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-info">
            <div className="card-body text-center">
              <h6 className="text-muted">Detection Rate</h6>
              <h4 className="text-info">{stats?.detection_rate || '0%'}</h4>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="mb-3">
        <div className="btn-group" role="group">
          <button
            type="button"
            className={`btn btn-outline-secondary ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Alerts
          </button>
          <button
            type="button"
            className={`btn btn-outline-danger ${filter === 'Critical' ? 'active' : ''}`}
            onClick={() => setFilter('Critical')}
          >
            Critical
          </button>
          <button
            type="button"
            className={`btn btn-outline-warning ${filter === 'High' ? 'active' : ''}`}
            onClick={() => setFilter('High')}
          >
            High
          </button>
          <button
            type="button"
            className={`btn btn-outline-info ${filter === 'Medium' ? 'active' : ''}`}
            onClick={() => setFilter('Medium')}
          >
            Medium
          </button>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="card">
        <div className="card-header bg-dark text-white">
          <h5 className="mb-0">Security Alerts ({filteredAlerts.length})</h5>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Timestamp</th>
                  <th>Type</th>
                  <th>Source IP</th>
                  <th>Destination IP</th>
                  <th>Severity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.length > 0 ? filteredAlerts.map((alert, idx) => (
                  <tr key={idx}>
                    <td><small>{new Date(alert.timestamp).toLocaleString()}</small></td>
                    <td><strong>{alert.type}</strong></td>
                    <td><code>{alert.source_ip}</code></td>
                    <td><code>{alert.destination_ip}</code></td>
                    <td>
                      <span className={`badge bg-${getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td>
                      <span className={getStatusBadge(alert.status)}>
                        {alert.status}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6" className="text-center text-muted py-3">
                      No alerts for this filter
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Threat Rules */}
      <div className="card mt-4">
        <div className="card-header bg-success text-white">
          <h5 className="mb-0">Active Detection Rules</h5>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead className="table-light">
                <tr>
                  <th>Rule ID</th>
                  <th>Rule Name</th>
                  <th>Status</th>
                  <th>Hits</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.id}</td>
                    <td>{rule.name}</td>
                    <td><span className="badge bg-success">{rule.status}</span></td>
                    <td>{rule.hits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
