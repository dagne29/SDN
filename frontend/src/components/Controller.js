import React, { useState, useEffect } from 'react';
import { controllerAPI } from '../services/api';

export default function Controller() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchControllerStatus();
    const interval = setInterval(fetchControllerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchControllerStatus = async () => {
    try {
      const response = await controllerAPI.getStatus();
      setStatus(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching controller status:', error);
    }
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
      <h2 className="mb-4">Controller Status</h2>

      <div className="row g-4">
        <div className="col-12 col-md-6 col-xl-4">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title">Connection</h5>
              <p className="card-text">
                {status.controller_connected ? (
                  <span className="badge bg-success">Connected</span>
                ) : (
                  <span className="badge bg-danger">Disconnected</span>
                )}
              </p>
              <p className="text-muted">Controller connection state to the Mininet topology.</p>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-6 col-xl-4">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title">Topology</h5>
              <p className="card-text">
                {status.topology_running ? (
                  <span className="badge bg-success">Running</span>
                ) : (
                  <span className="badge bg-danger">Stopped</span>
                )}
              </p>
              <p className="text-muted">Current Mininet topology state monitored by the controller.</p>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-12 col-xl-4">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title">Platform</h5>
              <p className="card-text">{status.hosts?.length || 0} hosts · {status.switches?.length || 0} switches</p>
              <p className="text-muted">Devices currently managed by the controller.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">Controller Details</h5>
        </div>
        <div className="card-body">
          <div className="row gy-3">
            <div className="col-12 col-lg-6">
              <div className="border rounded p-3 bg-light">
                <strong>Hosts</strong>
                <div className="mt-2">
                  {status.hosts?.map((host) => (
                    <span key={host} className="badge bg-secondary me-2 mb-2">
                      {host}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="col-12 col-lg-6">
              <div className="border rounded p-3 bg-light">
                <strong>Switches</strong>
                <div className="mt-2">
                  {status.switches?.map((sw) => (
                    <span key={sw} className="badge bg-secondary me-2 mb-2">
                      {sw}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="col-12">
              <div className="border rounded p-3 bg-light">
                <strong>Links</strong>
                <div className="mt-2">
                  {status.links?.map((link, idx) => (
                    <div key={idx} className="badge bg-info text-dark me-2 mb-2">
                      {link.src} ↔ {link.dst}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
