import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { controllerAPI } from '../services/api';

export default function FlowDetail() {
  const { flowId } = useParams();
  const navigate = useNavigate();
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const res = await controllerAPI.getFlows();
    const match = (res.data || []).find((item) => item?.id === flowId) || null;
    setFlow(match);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await load();
      } catch (error) {
        console.error('Error loading flow detail:', error);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [flowId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (error) {
      console.error('Error loading flow detail:', error);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <div className="p-5 text-center">Loading flow details...</div>;

  if (!flow) {
    return (
      <div className="container-fluid p-4">
        <div className="alert alert-warning d-flex justify-content-between align-items-center">
          <span>Flow {flowId} was not found.</span>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">Flow Detail</h2>
          <p className="text-muted mb-0">{flow.id}</p>
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={handleRefresh} disabled={refreshing}>
            <i className="bi bi-arrow-clockwise me-1" /> Refresh
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <table className="table table-borderless mb-0">
            <tbody>
              <tr><th style={{ width: 180 }}>Source</th><td>{flow.src_host || '—'} ({flow.src_ip || '—'})</td></tr>
              <tr><th>Destination</th><td>{flow.dst_host || '—'} ({flow.dst_ip || '—'})</td></tr>
              <tr><th>Protocol</th><td>{flow.protocol || '—'}</td></tr>
              <tr><th>Bytes</th><td>{flow.bytes ?? '—'}</td></tr>
              <tr><th>Packets</th><td>{flow.packets ?? '—'}</td></tr>
              <tr><th>Latency</th><td>{flow.latency_ms != null ? `${flow.latency_ms} ms` : '—'}</td></tr>
              <tr><th>Bandwidth</th><td>{flow.bandwidth_mbps != null ? `${flow.bandwidth_mbps} Mbps` : '—'}</td></tr>
              <tr><th>Status</th><td>{flow.status || '—'}</td></tr>
              <tr><th>Command</th><td><code>{flow.command || '—'}</code></td></tr>
              <tr><th>Timestamp</th><td>{flow.timestamp || '—'}</td></tr>
              <tr><th>Activity Type</th><td>{flow.activity_type || '—'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
