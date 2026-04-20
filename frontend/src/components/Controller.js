import React, { useState, useEffect } from 'react';
import { controllerAPI, trafficAPI, idsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function Controller() {
  const [status, setStatus] = useState(null);
  const [flows, setFlows] = useState([]);
  const [switches, setSwitches] = useState({});
  const [portStats, setPortStats] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    try {
      const [statRes, flowsRes, swRes, psRes, alertsRes] = await Promise.all([
        controllerAPI.getStatus(),
        controllerAPI.getFlows(),
        controllerAPI.getSwitches(),
        trafficAPI.getPortStats(),
        idsAPI.getAlerts(20),
      ]);

      setStatus(statRes.data || {});
      setFlows(flowsRes.data || []);
      setSwitches(swRes.data || {});
      setPortStats(psRes.data || []);
      setAlerts(alertsRes.data || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching controller data', err);
    }
  };

  const handleFlowClick = (flow) => {
    navigate(`/flows/${flow.id}`);
  };

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
      <h2 className="mb-4">Controller — Flows & Switches</h2>

      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <div className="card h-100">
            <div className="card-header"><strong>Controller Flows</strong></div>
            <div className="card-body">
              <p className="text-muted">Controller flow table is available separately.</p>
              <button className="btn btn-sm btn-primary" onClick={() => navigate('/controller/flows')}>Open Controller Flows</button>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card h-100">
            <div className="card-header"><strong>Switches & Port Stats</strong></div>
            <div className="card-body">
              <div className="mb-3">
                <strong>Switch List</strong>
                <div className="mt-2">
                  {Object.keys(switches).length ? (
                    Object.entries(switches).map(([sid, sdata]) => (
                      <div key={sid} className="mb-2">
                        <div><strong>{sid}</strong> — {sdata.name || 'Switch'}</div>
                        <small className="text-muted">Ports: {sdata.ports || (sdata.port_stats ? Object.keys(sdata.port_stats).length : '—')}</small>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted">No switches registered.</p>
                  )}
                </div>
              </div>

              <div>
                <strong>Port Stats</strong>
                {portStats.length ? (
                  <div className="mt-2">
                    {portStats.map((ps) => (
                      <div key={ps.switch} className="mb-2">
                        <div><strong>{ps.switch}</strong>: utilization {ps.utilization}%</div>
                        <small className="text-muted">Ports: {ps.ports}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted">No port stats available.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row mt-4">
        <div className="col-12 col-lg-6">
          <div className="card">
            <div className="card-header"><strong>IDS Alerts (recent)</strong></div>
            <div className="card-body">
              {alerts.length ? (
                <ul className="list-group list-group-flush">
                  {alerts.map(a => (
                    <li key={a.id} className="list-group-item">
                      <strong>{a.type}</strong> — {a.source_host} → {a.destination_host}
                      <div><small className="text-muted">{a.timestamp} • {a.severity}</small></div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No recent alerts.</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card">
            <div className="card-header"><strong>Attacker / Blocked IPs</strong></div>
            <div className="card-body">
              {status.blocked_ips?.length ? (
                <div>
                  {status.blocked_ips.map(ip => (
                    <div key={ip} className="badge bg-danger me-2 mb-2">{ip}</div>
                  ))}
                </div>
              ) : (
                <p className="text-muted">No blocked IPs</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
