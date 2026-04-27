import React, { useState, useEffect, useRef } from 'react';
import { topologyAPI, mininetAPI } from '../services/api';

export default function Topology() {
  const [devices, setDevices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pinPositions, setPinPositions] = useState(false);
  const [savedPositions, setSavedPositions] = useState(null);
  const [useBackground, setUseBackground] = useState(true);
  const networkRef = useRef(null);
  const visNetworkRef = useRef(null);
  const hostDisplayMapRef = useRef({});

  useEffect(() => {
    // load saved positions from localStorage
    try {
      const s = localStorage.getItem('topology_positions');
      if (s) setSavedPositions(JSON.parse(s));
    } catch (e) {}
    fetchTopology();
    const interval = setInterval(fetchTopology, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!devices) return;
    // build host display map (h1, h2, ...) and keep stable unless hosts change
    const hostKeys = devices.hosts ? Object.keys(devices.hosts).sort() : [];
    const oldMap = hostDisplayMapRef.current || {};
    const oldKeys = Object.keys(oldMap).sort();
    if (hostKeys.length !== oldKeys.length || hostKeys.some((k, i) => k !== oldKeys[i])) {
      const map = {};
      hostKeys.forEach((hid, idx) => {
        map[hid] = `h${idx + 1}`;
      });
      hostDisplayMapRef.current = map;
    }
    // build nodes and edges for vis-network
    const nodes = [];
    const edges = [];

    // add switches
    if (devices.switches) {
      Object.entries(devices.switches).forEach(([id, sw], idx) => {
        const base = { id: id, label: `${id}\n${sw.name}`, shape: 'box', color: { background: '#ffd966', border: '#d4a017' } };
        // apply saved position if available
        if (savedPositions && savedPositions[id]) {
          nodes.push({ ...base, x: savedPositions[id].x, y: savedPositions[id].y, fixed: pinPositions });
        } else {
          nodes.push(base);
        }
      });
    }

    // add controller node (always show controller)
    const controllerBase = { id: 'controller', label: `Controller`, shape: 'diamond', color: { background: '#c7f9cc', border: '#10b981' } };
    if (savedPositions && savedPositions['controller']) {
      nodes.push({ ...controllerBase, x: savedPositions['controller'].x, y: savedPositions['controller'].y, fixed: pinPositions });
    } else {
      nodes.push(controllerBase);
    }
    // connect controller to all switches
    if (devices.switches) {
      Object.keys(devices.switches).forEach((swid) => {
        edges.push({ id: `controller-${swid}`, from: 'controller', to: swid, color: { color: '#444' }, dashes: true });
      });
    }

    // add explicit routers if provided
    if (devices.routers) {
      Object.entries(devices.routers).forEach(([id, router]) => {
        const base = { id: id, label: `${router.name || id}\n${router.ip || ''}`, shape: 'triangle', color: { background: '#ffd1a8', border: '#d6862a' } };
        if (savedPositions && savedPositions[id]) {
          nodes.push({ ...base, x: savedPositions[id].x, y: savedPositions[id].y, fixed: pinPositions });
        } else {
          nodes.push(base);
        }
        if (router.connected_to) edges.push({ from: id, to: router.connected_to, color: { color: '#888' } });
      });
    }

    // add hosts
    if (devices.hosts) {
      Object.entries(devices.hosts).forEach(([id, host]) => {
        const isRouterRole = host.role === 'router';
        const shape = isRouterRole ? 'triangle' : 'ellipse';
        const color = host.role === 'attacker' ? { background: '#ffcccc', border: '#ff4d4d' } : { background: '#cfe9ff', border: '#4da6ff' };
        const displayId = (hostDisplayMapRef.current && hostDisplayMapRef.current[id]) || id;
        const base = { id: id, label: `${displayId} — ${host.name}\n${host.ip}`, shape, color };
        if (savedPositions && savedPositions[id]) {
          nodes.push({ ...base, x: savedPositions[id].x, y: savedPositions[id].y, fixed: pinPositions });
        } else {
          nodes.push(base);
        }
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
      // keep a stable layout so the topology structure remains visible
      physics: { stabilization: true, barnesHut: { gravitationalConstant: -6000 } },
      interaction: { hover: true, tooltipDelay: 100 },
      nodes: { font: { multi: true } },
    };

    if (networkRef.current) {
      // set schematic background if enabled
      try {
        networkRef.current.style.backgroundImage = useBackground ? "url('/topology-schematic.svg')" : '';
        networkRef.current.style.backgroundRepeat = 'no-repeat';
        networkRef.current.style.backgroundPosition = 'center center';
        networkRef.current.style.backgroundSize = 'contain';
      } catch (e) {}

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

  // apply a schematic layout: controller/top, routers above switches, switches in a row, hosts around their switch
  const applySchematic = () => {
    if (!visNetworkRef.current || !devices) return;
    const positions = {};
    // controller at top center
    positions['controller'] = { x: 0, y: -320 };

    // switches in a horizontal row
    const swIds = devices.switches ? Object.keys(devices.switches) : [];
    const swCount = swIds.length || 0;
    const spacing = 220;
    const startX = -((swCount - 1) * spacing) / 2;
    const swPos = {};
    swIds.forEach((sid, idx) => {
      const x = startX + idx * spacing;
      const y = 0;
      positions[sid] = { x, y };
      swPos[sid] = { x, y };
    });

    // routers (explicit) place above switches or top-left/right
    const routerIds = devices.routers ? Object.keys(devices.routers) : [];
    routerIds.forEach((rid, idx) => {
      // place routers above the switches if possible
      const target = swIds[idx % swIds.length] || null;
      const x = target ? swPos[target].x : -300 + idx * 160;
      const y = -160;
      positions[rid] = { x, y };
    });

    // hosts: place them in a circle around their connected switch
    const hosts = devices.hosts ? Object.entries(devices.hosts) : [];
    const hostsBySwitch = {};
    hosts.forEach(([hid, host]) => {
      const sw = host.connected_to || 'ungrouped';
      hostsBySwitch[sw] = hostsBySwitch[sw] || [];
      hostsBySwitch[sw].push(hid);
    });
    Object.entries(hostsBySwitch).forEach(([sw, list]) => {
      const center = swPos[sw] || { x: 0, y: 220 };
      const radius = 140;
      list.forEach((hid, i) => {
        const angle = (i / list.length) * Math.PI * 2;
        const x = Math.round(center.x + Math.cos(angle) * radius);
        const y = Math.round(center.y + Math.sin(angle) * radius + 40);
        positions[hid] = { x, y };
      });
    });

    // apply positions to network
    const updates = Object.entries(positions).map(([id, p]) => ({ id, x: p.x, y: p.y, fixed: pinPositions }));
    visNetworkRef.current.body.data.nodes.update(updates);
    // center view to controller
    visNetworkRef.current.focus('controller', { scale: 1.0 });
  };

  // save current positions from the network into localStorage
  const savePositions = () => {
    if (!visNetworkRef.current) return;
    const pos = visNetworkRef.current.getPositions();
    try {
      localStorage.setItem('topology_positions', JSON.stringify(pos));
      setSavedPositions(pos);
      setPinPositions(true);
    } catch (e) {}
  };

  const clearSavedPositions = () => {
    try {
      localStorage.removeItem('topology_positions');
      setSavedPositions(null);
      setPinPositions(false);
      // unfix nodes if network exists
      if (visNetworkRef.current) {
        const allIds = visNetworkRef.current.body.data.nodes.getIds();
        const updates = allIds.map((id) => ({ id, fixed: false }));
        visNetworkRef.current.body.data.nodes.update(updates);
      }
    } catch (e) {}
  };

  // UI helpers: toggle background
  const toggleBackground = () => {
    const newVal = !useBackground;
    setUseBackground(newVal);
    if (networkRef.current) {
      networkRef.current.style.backgroundImage = newVal ? "url('/topology-schematic.svg')" : '';
    }
  };

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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchTopology();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <div className="p-5 text-center">Loading topology...</div>;

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between align-items-center mb-4 gap-2">
        <h2 className="mb-0">Network Topology</h2>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleRefresh} disabled={refreshing}>
          <i className="bi bi-arrow-clockwise me-1" /> Refresh
        </button>
      </div>

      <div className="row g-4">
        <div className="col-12">
          <div className="card">
            <div className="card-header bg-dark text-white d-flex align-items-center justify-content-between">
              <h5 className="mb-0">Topology Map</h5>
              <div className="btn-group">
                <button className="btn btn-sm btn-outline-light" onClick={() => applySchematic()}>Apply Schematic</button>
                <button className={`btn btn-sm ${useBackground ? 'btn-success' : 'btn-outline-light'}`} onClick={() => toggleBackground()}>{useBackground ? 'Background On' : 'Background Off'}</button>
                <button className="btn btn-sm btn-outline-light" onClick={() => savePositions()}>Save Positions</button>
                <button className="btn btn-sm btn-outline-light" onClick={() => clearSavedPositions()}>Clear Positions</button>
              </div>
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
                        <strong>{(hostDisplayMapRef.current && hostDisplayMapRef.current[id]) || id}: {host.name}</strong>
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
              {(hostDisplayMapRef.current && hostDisplayMapRef.current[link.src]) || link.src} ↔ {(hostDisplayMapRef.current && hostDisplayMapRef.current[link.dst]) || link.dst}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
