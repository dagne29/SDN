import React, { useState, useEffect } from 'react';
import { controllerAPI, trafficAPI } from '../services/api';

export default function TrafficAnalysis() {
  const [flows, setFlows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrafficData();
    const interval = setInterval(fetchTrafficData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchTrafficData = async () => {
    try {
      const [flowsRes, statsRes] = await Promise.all([
        controllerAPI.getFlows(),
        trafficAPI.getStats()
      ]);
      setFlows(flowsRes.data);
      setStats(statsRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching traffic data:', error);
    }
  };

  if (loading) return <div className="p-5 text-center">Loading traffic data...</div>;

  const pingFlows = flows.filter(f => {
    if (!f) return false;
    const activityType = (f.activity_type || '').toString().toLowerCase();
    const cmd = (f.command || '').toString().toLowerCase();
    return activityType === 'ping' || cmd.includes('ping');
  });

  return (
    <div className="container-fluid p-4">
      <h2 className="mb-4">Ping Activity</h2>
      
      {/* Stats Cards */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card">
            <div className="card-body text-center">
              <h6 className="text-muted">Total Bytes</h6>
              <h4 className="text-primary">{stats?.total_bytes || 0}</h4>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card">
            <div className="card-body text-center">
              <h6 className="text-muted">Total Packets</h6>
              <h4 className="text-success">{stats?.total_packets || 0}</h4>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card">
            <div className="card-body text-center">
              <h6 className="text-muted">Total Flows</h6>
              <h4 className="text-info">{stats?.total_flows || 0}</h4>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card">
            <div className="card-body text-center">
              <h6 className="text-muted">Bandwidth In</h6>
              <h4 className="text-warning">{stats?.bandwidth_in || '0 Mbps'}</h4>
            </div>
          </div>
        </div>
      </div>

      {/* Traffic Flows Table */}
      <div className="card">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">Recent Mininet Ping Requests</h5>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-striped">
              <thead className="table-light">
                <tr>
                  <th>Flow ID</th>
                  <th>Source Host</th>
                  <th>Source IP</th>
                  <th>Dest Host</th>
                  <th>Dest IP</th>
                  <th>Protocol</th>
                  <th>Bytes</th>
                  <th>Packets</th>
                  <th>Time</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pingFlows.length > 0 ? pingFlows.map((flow, idx) => (
                  <tr key={idx}>
                    <td><code>{flow.id}</code></td>
                    <td>{flow.src_host}</td>
                    <td>{flow.src_ip}</td>
                    <td>{flow.dst_host}</td>
                    <td>{flow.dst_ip}</td>
                    <td><span className="badge bg-secondary">{flow.protocol || 'ICMP'}</span></td>
                    <td>{flow.bytes}</td>
                    <td>{flow.packets}</td>
                    <td>{flow.latency_ms} ms</td>
                    <td>{flow.timestamp}</td>
                    <td>
                      <span className={`badge ${flow.status === 'active' ? 'bg-success' : 'bg-danger'}`}>
                        {flow.status || 'active'}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="11" className="text-center text-muted">No ping requests available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
