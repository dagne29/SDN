import React, { useState, useEffect } from 'react';
import { topologyAPI } from '../services/api';

export default function Topology() {
  const [devices, setDevices] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTopology();
    const interval = setInterval(fetchTopology, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchTopology = async () => {
    try {
      const response = await topologyAPI.getDevices();
      setDevices(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching topology:', error);
    }
  };

  if (loading) return <div className="p-5 text-center">Loading topology...</div>;

  return (
    <div className="container-fluid p-4">
      <h2 className="mb-4">Network Topology</h2>
      
      <div className="row g-4">
        <div className="col-12 col-xl-6">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0">Switches</h5>
            </div>
            <div className="card-body">
              {devices?.switches && Object.entries(devices.switches).map(([id, sw]) => (
                <div key={id} className="mb-3 p-3 border rounded bg-light">
                  <strong>{id}: {sw.name}</strong>
                  <div className="text-muted small">IP: {sw.ip} | Ports: {sw.ports}</div>
                  <span className="badge bg-success">{sw.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-6">
          <div className="card">
            <div className="card-header bg-info text-white">
              <h5 className="mb-0">Hosts/Devices</h5>
            </div>
            <div className="card-body">
              {devices?.hosts && Object.entries(devices.hosts).map(([id, host]) => (
                <div key={id} className="mb-3 p-3 border rounded bg-light">
                  <strong>{id}: {host.name}</strong>
                  <div className="text-muted small">IP: {host.ip}</div>
                  <div className="text-muted small">MAC: {host.mac}</div>
                  <span className={`badge ${host.role === 'attacker' ? 'bg-danger' : 'bg-success'}`}>
                    {host.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header bg-warning text-dark">
          <h5 className="mb-0">Network Links</h5>
        </div>
        <div className="card-body">
          {devices?.links && devices.links.map((link, idx) => (
            <div key={idx} className="badge bg-secondary me-2 mb-2">
              {link.src} ↔ {link.dst}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
