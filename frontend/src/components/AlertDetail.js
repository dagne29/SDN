import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { idsAPI } from '../services/api';

export default function AlertDetail() {
  const { alertId } = useParams();
  const navigate = useNavigate();
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const res = await idsAPI.getAlerts(200);
    const match = (res.data || []).find((item) => item?.id === alertId) || null;
    setAlert(match);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await load();
      } catch (error) {
        console.error('Error loading alert detail:', error);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [alertId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (error) {
      console.error('Error loading alert detail:', error);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <div className="p-5 text-center">Loading alert details...</div>;

  if (!alert) {
    return (
      <div className="container-fluid p-4">
        <div className="alert alert-warning d-flex justify-content-between align-items-center">
          <span>Alert {alertId} was not found.</span>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">Alert Detail</h2>
          <p className="text-muted mb-0">{alert.id}</p>
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
              <tr><th style={{ width: 180 }}>Type</th><td>{alert.type || '—'}</td></tr>
              <tr><th>Severity</th><td>{alert.severity || '—'}</td></tr>
              <tr><th>Status</th><td>{alert.status || '—'}</td></tr>
              <tr><th>Source Host</th><td>{alert.source_host || '—'}</td></tr>
              <tr><th>Source IP</th><td>{alert.source_ip || '—'}</td></tr>
              <tr><th>Destination Host</th><td>{alert.destination_host || '—'}</td></tr>
              <tr><th>Destination IP</th><td>{alert.destination_ip || '—'}</td></tr>
              <tr><th>Reason</th><td>{alert.reason || '—'}</td></tr>
              <tr><th>Timestamp</th><td>{alert.timestamp || '—'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
