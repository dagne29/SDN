import React, { useEffect, useState } from 'react';
import { controllerAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function ControllerFlows() {
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await controllerAPI.getFlows();
        setFlows(res.data || []);
      } catch (err) {
        console.error('Error loading controller flows', err);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div className="p-5 text-center">
      <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
      <p className="mt-3">Loading controller flows...</p>
    </div>
  );

  return (
    <div className="container-fluid p-4">
      <h2 className="mb-4">Controller Ping Flows</h2>
      {(() => {
        const pingFlows = (flows || []).filter(f => {
          if (!f) return false;
          const activityType = (f.activity_type || '').toString().toLowerCase();
          const cmd = (f.command || '').toString().toLowerCase();
          return activityType === 'ping' || cmd.includes('ping');
        });
        return pingFlows.length ? (
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>ID</th>
                <th>Src</th>
                <th>Dst</th>
                <th>Proto</th>
                <th>Bytes</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {pingFlows.slice().reverse().map(f => (
                <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/flows/${f.id}`)}>
                  <td>{f.id}</td>
                  <td>{f.src_host || f.src_ip}</td>
                  <td>{f.dst_host || f.dst_ip}</td>
                  <td>{f.protocol}</td>
                  <td>{f.bytes}</td>
                  <td>{f.latency_ms ? `${f.latency_ms} ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : (
          <p className="text-muted">No controller ping flows available yet.</p>
        );
      })()}
    </div>
  );
}
