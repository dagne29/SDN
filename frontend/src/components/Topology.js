import React, { useState, useEffect, useRef } from 'react';
import { topologyAPI, mininetAPI } from '../services/api';

export default function Topology() {
  const [devices, setDevices] = useState(null);
  const [loading, setLoading] = useState(true);
  const networkRef = useRef(null);
  const visNetworkRef = useRef(null);

  useEffect(() => {
    fetchTopology();
    const interval = setInterval(fetchTopology, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!devices) return;
    // build nodes and edges for vis-network
    const nodes = [];
    const edges = [];

    // add switches
    if (devices.switches) {
      Object.entries(devices.switches).forEach(([id, sw], idx) => {
        nodes.push({ id: id, label: `${id}\n${sw.name}`, shape: 'box', color: { background: '#ffd966', border: '#d4a017' } });
      });
    }

    // add hosts
    if (devices.hosts) {
      Object.entries(devices.hosts).forEach(([id, host]) => {
        nodes.push({ id: id, label: `${host.name}\n${host.ip}`, shape: 'ellipse', color: host.role === 'attacker' ? { background: '#ffcccc', border: '#ff4d4d' } : { background: '#cfe9ff', border: '#4da6ff' } });
        // connect host to its switch if provided
        if (host.connected_to) {
          edges.push({ from: id, to: host.connected_to, color: { color: '#888' } });
        }
      });
    }

    // add links
    if (devices.links) {
      devices.links.forEach((l) => {
        // default grey; will be updated below if connectivity info shows reachability
        edges.push({ id: `${l.src}-${l.dst}`, from: l.src, to: l.dst, color: { color: '#777' }, arrows: '' });
      });
    }

    const data = { nodes: new window.vis.DataSet(nodes), edges: new window.vis.DataSet(edges) };
    const options = {
      physics: { stabilization: true, barnesHut: { gravitationalConstant: -6000 } },
      interaction: { hover: true, tooltipDelay: 100 },
      nodes: { font: { multi: true } },
    };

    if (networkRef.current) {
      visNetworkRef.current = new window.vis.Network(networkRef.current, data, options);

      // handle node clicks
      visNetworkRef.current.on('click', function (params) {
        if (params.nodes && params.nodes.length) {
          const nodeId = params.nodes[0];
          const node = data.nodes.get(nodeId);
          alert(`Clicked: ${node.label.replace(/\\n/g, ' — ')}`);
        }
      });

      // if query params include src/dst, highlight
      const search = new URLSearchParams(window.location.search);
      const src = search.get('src');
      const dst = search.get('dst');
      if (src || dst) {
        highlightPath(src, dst, visNetworkRef.current, data);
      }
      // fetch connectivity matrix and apply to edges if available
      (async () => {
        try {
          const connResp = await mininetAPI.getConnectivity();
          const connText = connResp.data;
          const reachable = parseConnectivity(connText);
          // update edge colors based on reachability between endpoints
          const edgeUpdates = [];
          data.edges.forEach((e) => {
            const f = e.from;
            const t = e.to;
            if (reachable.has(`${f}->${t}`) || reachable.has(`${t}->${f}`)) {
              edgeUpdates.push({ id: e.id || `${f}-${t}`, color: { color: '#10b981' }, width: 3 });
            } else {
              edgeUpdates.push({ id: e.id || `${f}-${t}`, color: { color: '#d1d5db' }, width: 1 });
            }
          });
          data.edges.update(edgeUpdates);
        } catch (e) {
          // ignore connectivity errors
        }
      })();
    }
  }, [devices]);

  // parse raw connectivity output into a set of reachable pairs like 'h31->h32'
  const parseConnectivity = (text) => {
    const reachable = new Set();
    if (!text || typeof text !== 'string') return reachable;
    const lines = text.split('\n');
    for (const line of lines) {
      const parts = line.split('->');
      if (parts.length < 2) continue;
      const src = parts[0].trim().split(' ')[0];
      const rest = parts[1].trim();
      // tokens separated by whitespace
      const tokens = rest.split(/\s+/).map(t => t.trim()).filter(Boolean);
      for (const t of tokens) {
        if (t === 'X') continue;
        // sometimes the token may include commas or punctuation
        const dest = t.replace(/[,;]+$/,'');
        reachable.add(`${src}->${dest}`);
      }
    }
    return reachable;
  };

  const highlightPath = (src, dst, network, data) => {
    if (!network || !data) return;
    const nodeIds = [];
    if (src && data.nodes.get(src)) nodeIds.push(src);
    if (dst && data.nodes.get(dst)) nodeIds.push(dst);

    const relatedEdges = [];
    data.edges.forEach((e) => {
      if ((e.from === src && e.to === dst) || (e.from === dst && e.to === src)) relatedEdges.push(e.id || `${e.from}-${e.to}`);
    });

    // set styles
    const updateNodes = nodeIds.map((n) => ({ id: n, color: { background: '#d1fae5', border: '#10b981' }, font: { color: '#064e3b' } }));
    data.nodes.update(updateNodes);
    const updateEdges = relatedEdges.map((eid) => ({ id: eid, color: { color: '#10b981' }, width: 4 }));
    data.edges.update(updateEdges);

    if (nodeIds.length) network.selectNodes(nodeIds);
    if (nodeIds.length) network.focus(nodeIds[0], { scale: 1.2 });
  };

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
        <div className="col-12">
          <div className="card">
            <div className="card-header bg-dark text-white">
              <h5 className="mb-0">Topology Map</h5>
            </div>
            <div className="card-body">
              <div id="topology-network" ref={networkRef} style={{ height: '520px', width: '100%' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4 mt-3">
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
