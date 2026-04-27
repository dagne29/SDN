import React, { useEffect, useState } from 'react';
import { controllerAPI, pingAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function ControllerFlows() {
  const [flows, setFlows] = useState([]);
  const [pingEvents, setPingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    const [controllerRes, pingRes] = await Promise.all([
      controllerAPI.getFlows(),
      pingAPI.getAll({ limit: 100 }),
    ]);
    setFlows(controllerRes.data || []);
    setPingEvents(pingRes.data || []);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await load();
      } catch (err) {
        console.error('Error loading controller flows', err);
      } finally {
        setLoading(false);
      }
    };
    run();
    const interval = setInterval(run, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      console.error('Error loading controller flows', err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return (
    <div className="p-5 text-center">
      <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
      <p className="mt-3">Loading controller flows...</p>
    </div>
  );

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between align-items-center mb-4 gap-2">
        <h2 className="mb-0">Controller Ping Flows</h2>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleRefresh} disabled={refreshing}>
          <i className="bi bi-arrow-clockwise me-1" /> Refresh
        </button>
      </div>
      <p className="text-muted mb-3">
        Showing ping activity from the shared ping store, plus any controller flow records that were tagged as ping.
      </p>
      {(() => {
        const pingFlows = [
          ...(pingEvents || []),
          ...(flows || []).filter(f => {
          if (!f) return false;
          const activityType = (f.activity_type || '').toString().toLowerCase();
          const cmd = (f.command || '').toString().toLowerCase();
          return activityType === 'ping' || cmd.includes('ping');
          }),
        ];
        const uniqueFlows = Array.from(new Map(pingFlows.map((flow) => [flow.id || `${flow.src_host}-${flow.dst_host}-${flow.timestamp}`, flow])).values());
        return uniqueFlows.length ? (
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
                <th>Output</th>
              </tr>
            </thead>
            <tbody>
              {uniqueFlows.slice().reverse().map(f => (
                <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/flows/${f.id}`)}>
                  <td>{f.id}</td>
                  <td>{f.src_host || f.src_ip}</td>
                  <td>{f.dst_host || f.dst_ip}</td>
                  <td>{f.protocol}</td>
                  <td>{f.bytes}</td>
                  <td>{f.latency_ms ? `${f.latency_ms} ms` : '—'}</td>
                  <td className="text-muted" style={{ maxWidth: 360, whiteSpace: 'normal' }}>{f.output || '—'}</td>
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
