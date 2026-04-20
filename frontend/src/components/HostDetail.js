import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { topologyAPI } from '../services/api';

export default function HostDetail() {
  const { hostId } = useParams();
  const navigate = useNavigate();
  const [host, setHost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await topologyAPI.getHosts();
        setHost(res.data?.[hostId] || null);
      } catch (error) {
        console.error('Error loading host detail:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [hostId]);

  if (loading) return <div className="p-5 text-center">Loading host details...</div>;

  if (!host) {
    return (
      <div className="container-fluid p-4">
        <div className="alert alert-warning d-flex justify-content-between align-items-center">
          <span>Host {hostId} was not found.</span>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">Host Detail</h2>
          <p className="text-muted mb-0">{hostId}</p>
        </div>
        <button className="btn btn-outline-secondary" onClick={() => navigate(-1)}>Back</button>
      </div>

      <div className="card">
        <div className="card-body">
          <table className="table table-borderless mb-0">
            <tbody>
              <tr><th style={{ width: 180 }}>Name</th><td>{host.name || hostId}</td></tr>
              <tr><th>IP</th><td>{host.ip || '—'}</td></tr>
              <tr><th>MAC</th><td>{host.mac || '—'}</td></tr>
              <tr><th>Role</th><td>{host.role || '—'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
