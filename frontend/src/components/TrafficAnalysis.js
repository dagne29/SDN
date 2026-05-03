import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import apiClient, { mininetAPI, pingAPI, trafficAPI, controllerAPI } from '../services/api';
import { appendPingHistory, clearPingHistory, formatPingTimelineTime, getPingSequence, getPingTimeMs, mergePingHistory, readPingHistory } from '../services/pingHistory';

// ─── Helpers ────────────────────────────────────────────────────────────────

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatTimestamp(raw) {
  const timeMs = Date.parse(raw || '') || 0;
  if (!timeMs) return '--:--:--';
  const d = new Date(timeMs);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
}

function groupPingRequests(flows) {
  const sorted = [...flows].sort((a, b) => {
    const ta = Date.parse(a?.timestamp || a?.time || '') || 0;
    const tb = Date.parse(b?.timestamp || b?.time || '') || 0;
    return tb - ta;
  });
  const groups = [];
  const used = new Set();
  sorted.forEach((flow, index) => {
    if (!flow || used.has(flow.id)) return;
    const origin = (flow.origin || '').toString().toLowerCase();
    if (!origin.includes('pingall')) { groups.push(flow); used.add(flow.id); return; }
    const baseTime = Date.parse(flow?.timestamp || flow?.time || '') || 0;
    const cluster = [flow];
    used.add(flow.id);
    for (let i = index + 1; i < sorted.length; i++) {
      const candidate = sorted[i];
      if (!candidate || used.has(candidate.id)) continue;
      if (!(candidate.origin || '').toString().toLowerCase().includes('pingall')) continue;
      if (Math.abs(baseTime - (Date.parse(candidate?.timestamp || candidate?.time || '') || 0)) > 5000) continue;
      cluster.push(candidate); used.add(candidate.id);
    }
    const successCount = cluster.filter(item => (item.status || '').toLowerCase() === 'success').length;
    const avgLatency = cluster.length ? roundTo(cluster.reduce((s, i) => s + Number(i.latency_ms || 0), 0) / cluster.length, 3) : 0;
    groups.push({ ...flow, id: `PINGALL-${flow.id}`, src_host: 'All Hosts', dst_host: `${cluster.length} connections`, status: successCount === cluster.length ? 'success' : successCount > 0 ? 'partial' : 'failed', latency_ms: avgLatency, round_trip_time: `${avgLatency} ms avg`, packets: cluster.reduce((s, i) => s + Number(i.packets || 0), 0), packets_transmitted: cluster.reduce((s, i) => s + Number(i.packets_transmitted ?? i.packets ?? 0), 0), packets_received: cluster.reduce((s, i) => s + Number(i.packets_received ?? 0), 0), bytes: cluster.reduce((s, i) => s + Number(i.bytes || 0), 0), packet_loss: `${cluster.length - successCount} failed`, output: `Pingall summary: ${cluster.length} connections tested, ${successCount} successful, ${cluster.length - successCount} failed.`, grouped_flows: cluster, is_grouped_pingall: true });
  });
  return groups;
}

// ─── MetricCard ─────────────────────────────────────────────────────────────

function MetricCard({ title, value, detail, accent = 'primary' }) {
  return (
    <div className="col-12 col-sm-6 col-xl-3">
      <div className="card h-100">
        <div className="card-body">
          <div className="text-muted small">{title}</div>
          <div className={`fs-3 fw-bold text-${accent}`}>{value}</div>
          {detail ? <div className="small text-muted">{detail}</div> : null}
        </div>
      </div>
    </div>
  );
}

// ─── LiveBarChart (animated SVG bar chart) ───────────────────────────────────

function LiveBarChart({ data, title, valueLabel = 'bytes', accent = '#0d6efd', height = 220 }) {
  // data: [{ label, value }]
  const MAX_BARS = 8;
  const bars = data.slice(0, MAX_BARS);
  const maxVal = Math.max(...bars.map(b => b.value), 1);
  const barW = 100 / (bars.length || 1);
  const CHART_H = height - 50; // leave room for labels

  return (
    <div>
      {title && <div className="fw-semibold mb-2 small text-muted">{title}</div>}
      {!bars.length ? (
        <div className="text-muted small py-3 text-center">No live traffic data yet.</div>
      ) : (
        <svg viewBox={`0 0 400 ${height}`} style={{ width: '100%', height: height, overflow: 'visible' }}>
          {/* grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <line key={t} x1="0" x2="400" y1={CHART_H * (1 - t)} y2={CHART_H * (1 - t)}
              stroke="rgba(100,116,139,0.15)" strokeWidth="1" />
          ))}
          {bars.map((bar, i) => {
            const pct = bar.value / maxVal;
            const bw = (400 / bars.length) - 6;
            const bx = i * (400 / bars.length) + 3;
            const bh = Math.max(4, pct * CHART_H);
            const by = CHART_H - bh;
            return (
              <g key={bar.label}>
                <rect x={bx} y={by} width={bw} height={bh} rx="4"
                  fill={accent} opacity="0.82"
                  style={{ transition: 'height 0.5s ease, y 0.5s ease' }}>
                  <title>{bar.label}: {bar.value} {valueLabel}</title>
                </rect>
                {/* value label */}
                <text x={bx + bw / 2} y={by - 4} textAnchor="middle" fontSize="9" fill="#64748b">
                  {bar.value > 999 ? `${(bar.value / 1000).toFixed(1)}k` : bar.value}
                </text>
                {/* x-axis label */}
                <text x={bx + bw / 2} y={CHART_H + 14} textAnchor="middle" fontSize="9" fill="#94a3b8">
                  {bar.label.length > 9 ? bar.label.slice(0, 9) + '…' : bar.label}
                </text>
              </g>
            );
          })}
          {/* x-axis */}
          <line x1="0" x2="400" y1={CHART_H} y2={CHART_H} stroke="rgba(100,116,139,0.3)" strokeWidth="1" />
        </svg>
      )}
    </div>
  );
}

// ─── LiveTrafficBarGraph (auto-updating) ────────────────────────────────────

function LiveTrafficBarGraph({ trafficFlows }) {
  const [tick, setTick] = useState(0);
  const [history, setHistory] = useState([]); // [{time, totalBytes}]

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  // Build per-node bar data from latest flows
  const nodeData = useMemo(() => {
    const map = {};
    trafficFlows.slice().reverse().slice(0, 30).forEach(flow => {
      const key = flow.src_host || flow.src_ip || 'unknown';
      map[key] = (map[key] || 0) + Number(flow.bytes || 0);
    });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [trafficFlows, tick]); // eslint-disable-line

  // Build trend history
  useEffect(() => {
    const totalBytes = trafficFlows.reduce((s, f) => s + Number(f.bytes || 0), 0);
    const now = new Date();
    const label = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setHistory(prev => {
      const next = [...prev, { label, value: totalBytes }];
      return next.slice(-12); // keep last 12 ticks
    });
  }, [tick]); // eslint-disable-line

  return (
    <div>
      {/* Real-time pulse indicator */}
      <div className="d-flex align-items-center gap-2 mb-3">
        <span className="position-relative d-inline-flex">
          <span className="badge rounded-pill bg-success" style={{ fontSize: 10, padding: '3px 8px' }}>
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: '#fff', marginRight: 5, animation: 'pulse 1.2s infinite',
              boxShadow: '0 0 0 0 rgba(255,255,255,0.7)'
            }} />
            LIVE
          </span>
        </span>
        <span className="text-muted small">Updates every 2s • Showing per-node byte totals</span>
      </div>

      <LiveBarChart
        data={nodeData}
        valueLabel="bytes"
        accent="#0d6efd"
        height={200}
      />

      {/* Trend sparkline at bottom */}
      {history.length > 2 && (
        <div className="mt-3 pt-3 border-top">
          <div className="text-muted small mb-2">Cumulative bytes trend (last {history.length} samples)</div>
          <LiveBarChart
            data={history}
            valueLabel="total bytes"
            accent="#198754"
            height={90}
          />
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.7); }
          70% { box-shadow: 0 0 0 6px rgba(255,255,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
        }
      `}</style>
    </div>
  );
}

// ─── PerNodeTrafficDetails ───────────────────────────────────────────────────

function PerNodeTrafficDetails({ trafficFlows }) {
  const [sortBy, setSortBy] = useState('bytes'); // bytes | packets | bandwidth | latency

  const nodes = useMemo(() => {
    const map = {};
    trafficFlows.forEach(flow => {
      const key = flow.src_host || flow.src_ip || 'unknown';
      if (!map[key]) map[key] = { node: key, bytes: 0, packets: 0, bandwidth: 0, latency: [], flows: 0, status: flow.status };
      map[key].bytes += Number(flow.bytes || 0);
      map[key].packets += Number(flow.packets || 0);
      map[key].bandwidth += Number(flow.bandwidth_mbps || 0);
      if (flow.latency_ms != null) map[key].latency.push(Number(flow.latency_ms));
      map[key].flows += 1;
    });
    return Object.values(map).map(n => ({
      ...n,
      bandwidth: roundTo(n.bandwidth, 2),
      avgLatency: n.latency.length ? roundTo(n.latency.reduce((a, b) => a + b, 0) / n.latency.length, 2) : null
    })).sort((a, b) => b[sortBy === 'latency' ? 'avgLatency' : sortBy] - a[sortBy === 'latency' ? 'avgLatency' : sortBy]);
  }, [trafficFlows, sortBy]);

  const maxBytes = Math.max(...nodes.map(n => n.bytes), 1);

  const grades = [
    { label: 'High Traffic',  color: '#dc3545', test: (n) => n.bytes > maxBytes * 0.7 },
    { label: 'Medium',        color: '#fd7e14', test: (n) => n.bytes > maxBytes * 0.3 },
    { label: 'Low',           color: '#198754', test: () => true },
  ];

  return (
    <div>
      {/* Sort controls */}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {['bytes', 'packets', 'bandwidth', 'latency'].map(key => (
          <button key={key} type="button"
            className={`btn btn-sm ${sortBy === key ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setSortBy(key)}>
            Sort: {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      {!nodes.length ? (
        <div className="text-muted small py-3 text-center">No per-node data yet.</div>
      ) : (
        <>
          {/* Bar visual */}
          <div className="mb-4">
            <LiveBarChart
              data={nodes.map(n => ({ label: n.node, value: n[sortBy === 'latency' ? 'avgLatency' : sortBy] || 0 }))}
              valueLabel={sortBy}
              accent="#0ea5e9"
              height={180}
            />
          </div>

          {/* Detailed table */}
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Node</th>
                  <th>Grade</th>
                  <th>Bytes</th>
                  <th>Packets</th>
                  <th>Bandwidth</th>
                  <th>Avg Latency</th>
                  <th>Flows</th>
                  <th>Usage</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map(n => {
                  const grade = grades.find(g => g.test(n));
                  const pct = Math.round((n.bytes / maxBytes) * 100);
                  return (
                    <tr key={n.node}>
                      <td className="fw-semibold"><code style={{ fontSize: 12 }}>{n.node}</code></td>
                      <td>
                        <span className="badge" style={{ background: grade.color, fontSize: 10 }}>{grade.label}</span>
                      </td>
                      <td>{n.bytes.toLocaleString()}</td>
                      <td>{n.packets.toLocaleString()}</td>
                      <td>{n.bandwidth} Mbps</td>
                      <td>{n.avgLatency != null ? `${n.avgLatency} ms` : '—'}</td>
                      <td>{n.flows}</td>
                      <td style={{ minWidth: 120 }}>
                        <div className="d-flex align-items-center gap-2">
                          <div className="progress flex-grow-1" style={{ height: 6 }}>
                            <div className="progress-bar" style={{ width: `${pct}%`, background: grade.color }} />
                          </div>
                          <span className="small text-muted">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TrafficTrends ───────────────────────────────────────────────────────────

function TrafficTrends({ trafficFlows, stats }) {
  const [window_min, setWindowMin] = useState(5);

  // Build time-bucketed data
  const bucketedData = useMemo(() => {
    const now = Date.now();
    const buckets = {};
    const bucketMs = window_min * 60 * 1000 / 12; // 12 buckets across window
    trafficFlows.forEach(flow => {
      const t = Date.parse(flow.timestamp || flow.time || flow.created_at || '') || 0;
      if (!t || (now - t) > window_min * 60 * 1000) return;
      const key = Math.floor(t / bucketMs);
      if (!buckets[key]) buckets[key] = { bytes: 0, packets: 0, count: 0 };
      buckets[key].bytes += Number(flow.bytes || 0);
      buckets[key].packets += Number(flow.packets || 0);
      buckets[key].count += 1;
    });
    const keys = Object.keys(buckets).sort();
    return keys.map(k => {
      const ts = Number(k) * bucketMs;
      const d = new Date(ts);
      return { label: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`, ...buckets[k] };
    });
  }, [trafficFlows, window_min]);

  const protocolDist = useMemo(() => {
    const map = {};
    trafficFlows.forEach(f => {
      const p = (f.protocol || 'UNKNOWN').toUpperCase();
      map[p] = (map[p] || 0) + 1;
    });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a,b) => b.value - a.value);
  }, [trafficFlows]);

  const statusDist = useMemo(() => {
    const map = {};
    trafficFlows.forEach(f => {
      const s = (f.status || 'unknown').toLowerCase();
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([label, value]) => ({ label, value }));
  }, [trafficFlows]);

  const statusColors = { success: '#198754', active: '#0d6efd', suspicious: '#dc3545', failed: '#dc3545', unknown: '#6c757d', partial: '#fd7e14' };

  return (
    <div>
      {/* KPI row */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Active Flows', value: stats?.active_flows ?? 0, color: '#0d6efd' },
          { label: 'Avg Latency', value: stats?.avg_latency_ms != null ? `${stats.avg_latency_ms} ms` : '—', color: '#198754' },
          { label: 'Total Bandwidth', value: stats?.bandwidth_in || '0.00 Mbps', color: '#fd7e14' },
          { label: 'Tracked Flows', value: trafficFlows.length, color: '#6f42c1' },
          { label: 'Suspicious', value: stats?.suspicious_flows ?? 0, color: '#dc3545' },
          { label: 'Total Bytes', value: stats?.total_bytes ? (stats.total_bytes / 1024).toFixed(1) + ' KB' : '0 KB', color: '#0ea5e9' },
        ].map(({ label, value, color }) => (
          <div key={label} className="col-6 col-lg-4 col-xl-2">
            <div className="card border-0 h-100" style={{ background: '#f8fafc' }}>
              <div className="card-body p-3">
                <div className="text-muted" style={{ fontSize: 11 }}>{label}</div>
                <div className="fw-bold fs-5" style={{ color }}>{value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Time window selector */}
      <div className="d-flex align-items-center gap-2 mb-3">
        <span className="text-muted small">Time window:</span>
        {[1, 5, 15, 30].map(m => (
          <button key={m} type="button"
            className={`btn btn-sm ${window_min === m ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setWindowMin(m)}>
            {m}m
          </button>
        ))}
      </div>

      {/* Bytes over time */}
      <div className="card mb-3 border-0" style={{ background: '#f8fafc' }}>
        <div className="card-body">
          <div className="fw-semibold mb-2">Bytes / Time Bucket (last {window_min} min)</div>
          <LiveBarChart data={bucketedData.map(b => ({ label: b.label, value: b.bytes }))} valueLabel="bytes" accent="#0d6efd" height={150} />
        </div>
      </div>

      <div className="row g-3">
        {/* Protocol distribution */}
        <div className="col-12 col-lg-6">
          <div className="card border-0 h-100" style={{ background: '#f8fafc' }}>
            <div className="card-body">
              <div className="fw-semibold mb-2">Protocol Distribution</div>
              <LiveBarChart data={protocolDist} valueLabel="flows" accent="#6f42c1" height={140} />
            </div>
          </div>
        </div>

        {/* Status distribution */}
        <div className="col-12 col-lg-6">
          <div className="card border-0 h-100" style={{ background: '#f8fafc' }}>
            <div className="card-body">
              <div className="fw-semibold mb-2">Flow Status Distribution</div>
              {statusDist.length ? (
                <div className="d-flex flex-column gap-2 mt-2">
                  {statusDist.map(({ label, value }) => {
                    const total = statusDist.reduce((s, d) => s + d.value, 0);
                    const pct = Math.round((value / total) * 100);
                    const color = statusColors[label] || '#6c757d';
                    return (
                      <div key={label}>
                        <div className="d-flex justify-content-between small mb-1">
                          <span className="fw-semibold" style={{ color }}>{label}</span>
                          <span>{value} ({pct}%)</span>
                        </div>
                        <div className="progress" style={{ height: 8 }}>
                          <div className="progress-bar" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="text-muted small">No data yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TrafficAnalysis() {
  const apiBaseUrl = apiClient?.defaults?.baseURL || '';
  const location = useLocation();
  const [flows, setFlows] = useState([]);
  const [archivedFlows, setArchivedFlows] = useState(() => readPingHistory());
  const [recentPingsClearedAt, setRecentPingsClearedAt] = useState(() => {
    try { const raw = window?.localStorage?.getItem('sdn_recent_pings_cleared_at_v1'); const value = raw ? Number(raw) : 0; return Number.isFinite(value) ? value : 0; } catch (e) { return 0; }
  });
  const [recentPingsClearedAfterId, setRecentPingsClearedAfterId] = useState(() => {
    try { return window?.localStorage?.getItem('sdn_recent_pings_cleared_after_id_v1') || ''; } catch (e) { return ''; }
  });
  const [stats, setStats] = useState(null);
  const [hosts, setHosts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pingSelection, setPingSelection] = useState({ src: 'user1', dst: 'mail_srv' });
  const [pingRunning, setPingRunning] = useState(false);
  const [filterHost, setFilterHost] = useState('all');
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [filterWindow, setFilterWindow] = useState('24h');

  const handleClearRecentPingActivity = async () => {
    try {
      await pingAPI.clearAll({ includeFlows: true });
      clearPingHistory(); setFlows([]); setArchivedFlows([]); setRecentPingsClearedAt(0); setRecentPingsClearedAfterId('');
      try { window?.localStorage?.removeItem('sdn_recent_pings_cleared_at_v1'); window?.localStorage?.removeItem('sdn_recent_pings_cleared_after_id_v1'); } catch (e) {}
      try { window?.dispatchEvent(new CustomEvent('sdn_recent_pings_cleared', { detail: { clearedAt: 0, clearedAfterId: '' } })); } catch (e) {}
      await fetchTrafficData();
    } catch (e) { console.error('Failed to clear:', e); }
  };

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith('/traffic/live')) return 'live';
    if (location.pathname.startsWith('/traffic/table')) return 'table';
    if (location.pathname.startsWith('/traffic/pings')) return 'pings';
    if (location.pathname.startsWith('/traffic/analyzer')) return 'analyzer';
    if (location.pathname.startsWith('/traffic/attack')) return 'attack';
    if (location.pathname.startsWith('/traffic/history')) return 'history';
    if (location.pathname.startsWith('/traffic/filters')) return 'filters';
    return 'overview';
  }, [location.pathname]);

  const fetchTrafficData = async () => {
    try {
      const [pingsRes, pingStatsRes, statusRes] = await Promise.all([
        pingAPI.getAll({ limit: 100 }),
        pingAPI.getStats(),
        mininetAPI.getStatus(),
      ]);
      const pingData = pingsRes.data || [];
      setFlows(pingData);
      const nextArchive = appendPingHistory(pingData, { max: 200 });
      setArchivedFlows(nextArchive);
      setHosts(statusRes.data?.hosts || []);
      setAlerts(pingData.filter(ping => ping.attack_detected || ((ping.generated_alerts || []).length > 0)));
      const combined = mergePingHistory(nextArchive, pingData, { max: 200 });
      const totalBytes = combined.reduce((acc, ping) => acc + Number(ping.bytes || 0), 0);
      const totalPackets = combined.reduce((acc, ping) => acc + Number(ping.packets || 0), 0);
      const suspiciousFlows = combined.filter(ping => ping.attack_detected || (ping.status || '').toLowerCase() === 'suspicious').length;
      const avgLatency = combined.length ? roundTo(combined.reduce((acc, ping) => acc + Number(ping.latency_ms || 0), 0) / combined.length, 3) : 0;
      setStats({ ...(pingStatsRes.data || {}), total_bytes: totalBytes, total_packets: totalPackets, total_flows: combined.length, active_flows: combined.filter(ping => (ping.status || '').toLowerCase() === 'active').length, suspicious_flows: suspiciousFlows, bandwidth_in: `${roundTo(combined.reduce((acc, ping) => acc + Number(ping.bandwidth_mbps || 0), 0), 2)} Mbps`, avg_latency_ms: avgLatency });
      if (statusRes.data?.hosts?.length > 1) setPingSelection({ src: statusRes.data.hosts[0], dst: statusRes.data.hosts[1] });
    } catch (error) { console.error('Error fetching traffic data:', error); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchTrafficData();
    const interval = setInterval(fetchTrafficData, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (event) => {
      const next = Number(event?.detail?.clearedAt || 0);
      if (!Number.isFinite(next) || next <= 0) return;
      setRecentPingsClearedAt(next);
      if (event?.detail?.clearedAfterId) setRecentPingsClearedAfterId(String(event.detail.clearedAfterId));
    };
    window.addEventListener('sdn_recent_pings_cleared', handler);
    return () => window.removeEventListener('sdn_recent_pings_cleared', handler);
  }, []);

  const trafficFlows = useMemo(() => {
    return mergePingHistory(archivedFlows, flows, { max: 200 }).filter(f => f);
  }, [archivedFlows, flows]);

  const pingFlows = trafficFlows.filter(f => {
    const t = (f.activity_type || '').toString().toLowerCase();
    const c = (f.command || '').toString().toLowerCase();
    return t === 'ping' || c.includes('ping');
  });

  const visiblePingFlows = useMemo(() => {
    if (recentPingsClearedAfterId) {
      const clearedSeq = getPingSequence({ id: recentPingsClearedAfterId });
      return pingFlows.filter(flow => {
        const seq = getPingSequence(flow);
        if (seq != null && clearedSeq != null) return seq > clearedSeq;
        const key = (flow?.id || flow?.flow_id || '').toString();
        if (key) return key !== recentPingsClearedAfterId;
        return getPingTimeMs(flow) > recentPingsClearedAt;
      });
    }
    if (!recentPingsClearedAt) return pingFlows;
    return pingFlows.filter(f => getPingTimeMs(f) > recentPingsClearedAt);
  }, [pingFlows, recentPingsClearedAt, recentPingsClearedAfterId]);

  const groupedVisiblePingFlows = useMemo(() => groupPingRequests(visiblePingFlows), [visiblePingFlows]);
  const recentPingActivity = useMemo(() =>
    [...groupedVisiblePingFlows].sort((a, b) => getPingTimeMs(a) - getPingTimeMs(b)).slice(-4),
    [groupedVisiblePingFlows]
  );
  const suspiciousFlows = trafficFlows.filter(f => (f.status || '').toLowerCase() === 'suspicious' || (f.src_host || '').startsWith('atk_'));
  const filteredFlows = trafficFlows.filter(f => {
    const hostMatch = filterHost === 'all' || f.src_host === filterHost || f.dst_host === filterHost;
    const protocolMatch = filterProtocol === 'all' || (f.protocol || '').toUpperCase() === filterProtocol.toUpperCase();
    return hostMatch && protocolMatch;
  });
  const protocolCounts = Object.entries(trafficFlows.reduce((acc, f) => {
    const p = (f.protocol || 'UNKNOWN').toUpperCase(); acc[p] = (acc[p] || 0) + 1; return acc;
  }, {})).map(([protocol, count]) => ({ protocol, count }));
  const topTalkers = Object.entries(trafficFlows.reduce((acc, f) => {
    const h = f.src_host || f.src_ip || 'unknown'; acc[h] = (acc[h] || 0) + Number(f.bytes || 0); return acc;
  }, {})).map(([host, bytes]) => ({ host, bytes })).sort((a, b) => b.bytes - a.bytes).slice(0, 6);
  const bandwidthByHost = Object.entries(trafficFlows.reduce((acc, f) => {
    const h = f.src_host || f.src_ip || 'unknown'; acc[h] = (acc[h] || 0) + Number(f.bandwidth_mbps || 0); return acc;
  }, {})).map(([host, bandwidth]) => ({ host, bandwidth: Number(bandwidth.toFixed(2)) })).sort((a, b) => b.bandwidth - a.bandwidth).slice(0, 6);

  const openPingTest = async () => {
    try { setPingRunning(true); await trafficAPI.runPingTest(pingSelection.src, pingSelection.dst); await fetchTrafficData(); }
    catch (error) { console.error('Ping test failed:', error); }
    finally { setPingRunning(false); }
  };

  if (loading) return <div className="p-5 text-center">Loading traffic data...</div>;

  return (
    <div className="container-fluid p-4">
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3">
        <div>
          <h2 className="mb-1">Traffic</h2>
          <p className="text-muted mb-0">Overview, live activity, flows, analysis, attacks, history, and filters.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="text-muted small">{trafficFlows.length} flows • {alerts.length} alerts • {hosts.length} hosts</div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setRefreshing(true); fetchTrafficData().finally(() => setRefreshing(false)); }} disabled={refreshing}>
            <i className="bi bi-arrow-clockwise me-1" /> Refresh
          </button>
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {activeKey === 'overview' && (
        <div className="row g-4">
          <div className="col-12">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Recent Live Flow Snapshot</strong></div>
              <div className="card-body">
                {trafficFlows.slice().reverse().slice(0, 5).map(flow => (
                  <div key={flow.id} className="d-flex justify-content-between border-bottom py-2">
                    <div>
                      <div className="fw-semibold">{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</div>
                      <div className="small text-muted">{flow.protocol || 'ICMP'} | {flow.bytes || 0} bytes | {flow.packets || 0} packets</div>
                      {flow.output && <div className="small text-muted">{flow.output}</div>}
                    </div>
                    <div className="text-end small text-muted">{formatTimestamp(flow.timestamp || flow.time || flow.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LIVE ── */}
      {activeKey === 'live' && (
        <div className="card">
          <div className="card-header bg-primary text-white"><strong>Live Traffic</strong></div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-striped table-hover">
                <thead className="table-light">
                  <tr><th>Source → Destination</th><th>Protocol</th><th>Bytes</th><th>Packets</th><th>Status</th><th>Timestamp</th></tr>
                </thead>
                <tbody>
                  {trafficFlows.slice().reverse().slice(0, 20).map(flow => (
                    <tr key={flow.id}>
                      <td>{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</td>
                      <td><span className="badge bg-secondary">{flow.protocol || 'ICMP'}</span></td>
                      <td>{flow.bytes || 0}</td><td>{flow.packets || 0}</td>
                      <td><span className={`badge ${flow.status === 'active' ? 'bg-success' : 'bg-warning text-dark'}`}>{flow.status || 'active'}</span></td>
                      <td>{formatTimestamp(flow.timestamp || flow.time || flow.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TABLE ── */}
      {activeKey === 'table' && (
        <div className="card">
          <div className="card-header bg-dark text-white"><strong>Flow Table</strong></div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-sm table-striped">
                <thead className="table-light">
                  <tr><th>Flow ID</th><th>Match Fields</th><th>Actions</th><th>Duration</th><th>Protocol</th><th>Source</th><th>Destination</th></tr>
                </thead>
                <tbody>
                  {trafficFlows.slice().reverse().slice(0, 20).map(flow => (
                    <tr key={flow.id}>
                      <td><code>{flow.id}</code></td>
                      <td><div className="small">IP: {flow.src_ip || '—'} → {flow.dst_ip || '—'}<br />MAC: {flow.src_mac || '—'} → {flow.dst_mac || '—'}</div></td>
                      <td>{flow.command || 'forward'}</td>
                      <td>{flow.latency_ms != null ? `${flow.latency_ms} ms` : '—'}</td>
                      <td>{flow.protocol || 'ICMP'}</td>
                      <td>{flow.src_host || flow.src_ip}</td>
                      <td>{flow.dst_host || flow.dst_ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── PINGS ── */}
      {activeKey === 'pings' && (
        <div className="card">
          <div className="card-header bg-primary text-white"><strong>Ping Results (Mininet / Terminal)</strong></div>
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
              <div className="text-muted small">{groupedVisiblePingFlows.length} ping request(s) shown (raw: {pingFlows.length})</div>
            </div>
            <div className="card border-0 bg-light mb-4">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
                  <div>
                    <div className="fw-semibold">Recent Ping Activity</div>
                    <div className="small text-muted">Latest ping events appear here.</div>
                  </div>
                  <button type="button" className="btn btn-sm btn-danger" onClick={handleClearRecentPingActivity}>
                    <i className="bi bi-trash3 me-1" />Clear Recent Activity
                  </button>
                </div>
                {recentPingActivity.length ? (
                  <div className="row g-3">
                    {recentPingActivity.map((flow, index) => (
                      <div key={flow.id} className="col-12 col-xl-6">
                        <div className="card h-100 shadow-sm border-0">
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
                              <div className="fw-semibold">#{String(index + 1).padStart(2, '0')} {flow.src_host || flow.src_ip || '—'} → {flow.dst_host || flow.dst_ip || '—'}</div>
                              <span className={`badge ${(flow.status || '').toLowerCase().includes('success') ? 'bg-success' : 'bg-danger'}`}>{flow.status || 'unknown'}</span>
                            </div>
                            <div className="small text-muted mb-1">{flow.protocol || 'ICMP'} • {flow.packets || 0} pkts • {flow.bytes || 0} bytes</div>
                            <div className="small text-muted mb-1">RTT: {flow.round_trip_time || (flow.latency_ms != null ? `${flow.latency_ms} ms` : '—')}</div>
                            <div className="small text-muted mb-2">{formatPingTimelineTime(flow)}</div>
                            {flow.output && <div className="small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(flow.output).trim()}</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-muted small">No recent ping activity.</div>}
              </div>
            </div>
            {!groupedVisiblePingFlows.length && (
              <div className="alert alert-warning py-2">
                Dashboard is querying <code>{apiBaseUrl || '(unknown)'}</code>. Set <code>SDN_PING_INGEST_URL</code> to <code>{apiBaseUrl ? `${apiBaseUrl}/pings/ingest` : 'http://<backend>:5000/api/pings/ingest'}</code>.
              </div>
            )}
            <div className="table-responsive">
              <table className="table table-sm table-striped align-middle">
                <thead className="table-light">
                  <tr><th>Source → Destination</th><th>Src IP</th><th>Dst IP</th><th>Attacker</th><th>Status</th><th>RTT</th><th>Loss</th><th>Packets</th><th>Timestamp</th><th style={{ minWidth: 260 }}>Output</th></tr>
                </thead>
                <tbody>
                  {groupedVisiblePingFlows.slice(0, 25).map(flow => (
                    <tr key={flow.id}>
                      <td className="fw-semibold">{flow.src_host || flow.src_ip || '—'} → {flow.dst_host || flow.dst_ip || '—'}</td>
                      <td className="small text-muted">{flow.src_ip || '—'}</td>
                      <td className="small text-muted">{flow.dst_ip || '—'}</td>
                      <td><span className={`badge ${(flow.attack_detected || (flow.src_host || '').startsWith('atk_')) ? 'bg-danger' : 'bg-secondary'}`}>{(flow.attack_detected || (flow.src_host || '').startsWith('atk_')) ? 'Yes' : 'No'}</span></td>
                      <td><span className={`badge ${(flow.status || '').toLowerCase().includes('success') ? 'bg-success' : (flow.status || '').toLowerCase().includes('partial') ? 'bg-warning text-dark' : 'bg-danger'}`}>{flow.status || 'unknown'}</span></td>
                      <td>{flow.round_trip_time || (flow.latency_ms != null ? `${flow.latency_ms} ms` : '—')}</td>
                      <td>{flow.packet_loss || (flow.packet_loss_pct != null ? `${flow.packet_loss_pct}%` : '—')}</td>
                      <td>{flow.packets_transmitted ?? flow.packets ?? '—'} / {flow.packets_received ?? '—'}</td>
                      <td className="text-muted small">{formatTimestamp(flow.timestamp || flow.time || flow.created_at)}</td>
                      <td>{flow.output ? (<details><summary className="small text-muted">show</summary><pre className="mt-2 mb-0" style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#0b1220', color: '#e2e8f0', padding: 10, borderRadius: 8 }}>{String(flow.output).trim()}</pre></details>) : <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                  {!groupedVisiblePingFlows.length && <tr><td colSpan="10" className="text-center text-muted">No ping results yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ANALYZER (enhanced) ── */}
      {activeKey === 'analyzer' && (
        <div className="row g-4">
          {/* Live Traffic Bar Graph */}
          <div className="col-12">
            <div className="card">
              <div className="card-header d-flex align-items-center gap-2" style={{ background: '#1e293b', color: '#fff' }}>
                <i className="bi bi-bar-chart-fill" />
                <strong>Live Traffic Graph</strong>
                <span className="badge bg-success ms-auto" style={{ fontSize: 10 }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#fff', marginRight: 4, animation: 'pulse2 1.2s infinite' }} />
                  LIVE
                </span>
              </div>
              <div className="card-body">
                <LiveTrafficBarGraph trafficFlows={trafficFlows} />
              </div>
            </div>
          </div>

          {/* Traffic Trends */}
          <div className="col-12">
            <div className="card">
              <div className="card-header" style={{ background: '#0d6efd', color: '#fff' }}>
                <i className="bi bi-graph-up-arrow me-2" />
                <strong>Traffic Trends</strong>
              </div>
              <div className="card-body">
                <TrafficTrends trafficFlows={trafficFlows} stats={stats} />
              </div>
            </div>
          </div>

          {/* Per-Node Traffic Details */}
          <div className="col-12">
            <div className="card">
              <div className="card-header" style={{ background: '#198754', color: '#fff' }}>
                <i className="bi bi-hdd-network me-2" />
                <strong>Per-Node Traffic Details</strong>
                <span className="ms-2 badge bg-light text-dark" style={{ fontSize: 10 }}>Best</span>
              </div>
              <div className="card-body">
                <PerNodeTrafficDetails trafficFlows={trafficFlows} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ATTACK ── */}
      {activeKey === 'attack' && (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-danger text-white"><strong>Suspicious Traffic</strong></div>
              <div className="card-body">
                {suspiciousFlows.length ? (
                  <div className="list-group list-group-flush">
                    {suspiciousFlows.slice().reverse().slice(0, 10).map(flow => (
                      <div key={flow.id} className="list-group-item">
                        <div className="fw-semibold">{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</div>
                        <div className="small text-muted">{flow.protocol || 'ICMP'} | {flow.command || '—'}</div>
                        <span className="badge bg-danger mt-2">{flow.status || 'suspicious'}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-muted mb-0">No suspicious flows detected yet.</p>}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-warning text-dark"><strong>Attack Alerts</strong></div>
              <div className="card-body">
                {alerts.length ? (
                  <div className="list-group list-group-flush">
                    {alerts.slice().reverse().slice(0, 10).map(alert => (
                      <div key={alert.id} className="list-group-item">
                        <div className="fw-semibold">{alert.type}</div>
                        <div className="small text-muted">{alert.source_host} → {alert.destination_host}</div>
                        <div className="small text-muted">{alert.reason}</div>
                        <span className="badge bg-secondary mt-2">{alert.severity}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-muted mb-0">No attack alerts yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY ── */}
      {activeKey === 'history' && (
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>Saved Flows</strong></div>
              <div className="card-body">
                {trafficFlows.slice().reverse().slice(0, 15).map(flow => (
                  <div key={flow.id} className="border-bottom py-2">
                    <div className="fw-semibold">{flow.id}</div>
                    <div className="small text-muted">{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</div>
                    <div className="small text-muted">{flow.protocol || 'ICMP'} | {formatTimestamp(flow.timestamp || flow.time || flow.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Previous Tests</strong></div>
              <div className="card-body">
                {trafficFlows.filter(f => ['ping', 'traffic'].includes((f.activity_type || '').toLowerCase())).slice().reverse().slice(0, 15).map(flow => (
                  <div key={flow.id} className="border-bottom py-2">
                    <div className="fw-semibold">{flow.command || flow.id}</div>
                    <div className="small text-muted">{flow.status || 'active'} | {formatTimestamp(flow.timestamp || flow.time || flow.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FILTERS ── */}
      {activeKey === 'filters' && (
        <div className="row g-4">
          <div className="col-12 col-xl-4">
            <div className="card h-100">
              <div className="card-header bg-primary text-white"><strong>Filters & Controls</strong></div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label">By host</label>
                  <select className="form-select" value={filterHost} onChange={e => setFilterHost(e.target.value)}>
                    <option value="all">All hosts</option>
                    {hosts.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">By protocol</label>
                  <select className="form-select" value={filterProtocol} onChange={e => setFilterProtocol(e.target.value)}>
                    <option value="all">All protocols</option>
                    <option value="ICMP">ICMP</option><option value="TCP">TCP</option><option value="UDP">UDP</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">By time</label>
                  <select className="form-select" value={filterWindow} onChange={e => setFilterWindow(e.target.value)}>
                    <option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-8">
            <div className="card h-100">
              <div className="card-header bg-dark text-white"><strong>Filtered Traffic</strong></div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-sm table-striped">
                    <thead className="table-light">
                      <tr><th>Flow</th><th>Protocol</th><th>Bytes</th><th>Packets</th><th>Timestamp</th></tr>
                    </thead>
                    <tbody>
                      {filteredFlows.slice().reverse().slice(0, 20).map(flow => (
                        <tr key={flow.id}>
                          <td>{flow.src_host || flow.src_ip} → {flow.dst_host || flow.dst_ip}</td>
                          <td>{flow.protocol || 'ICMP'}</td><td>{flow.bytes || 0}</td><td>{flow.packets || 0}</td><td>{flow.timestamp}</td>
                        </tr>
                      ))}
                      {!filteredFlows.length && <tr><td colSpan="5" className="text-center text-muted">No flows match current filters</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse2 {
          0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.7); }
          70% { box-shadow: 0 0 0 5px rgba(255,255,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
        }
      `}</style>
    </div>
  );
}