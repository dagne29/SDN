import React, { useEffect, useRef, useState, useCallback } from 'react';
import { topologyAPI, mininetAPI, controllerAPI, pingAPI } from '../services/api';

// ─── Constants ──────────────────────────────────────────────────────────────
const PING_VISIBLE_MS = 3 * 60 * 1000; // 3 minutes
const ANIM_DURATION_MS = 2000;          // dot travels full path in 2s

const ATTACKER_ROLES = ['attacker','ddos','syn','arp','scan','brute','icmp'];

// ─── Exact topology matching the real GNS3 diagram ──────────────────────────
// Layout is fixed: Controller → CoreSwitch → 7 switches → hosts/attackers
// Coordinates are pre-computed for a 1200×700 canvas

const FIXED_NODES = {
  // ── Controller ──
  controller: {
    id: 'controller', label: 'RYU SDN\nCONTROLLER', sublabel: 'SDNCONTROLLER',
    type: 'controller', x: 600, y: 55,
  },

  // ── Core Switch ──
  s1: {
    id: 's1', label: 'Coreswitch', sublabel: 's1',
    type: 'coreswitch', x: 600, y: 200,
    ip: '10.255.0.1', ports: 7,
  },

  // ── Access Switches (left to right matching image) ──
  userswitch: {
    id: 'userswitch', label: 'userswitch', sublabel: 's2',
    type: 'switch', x: 105, y: 335,
    ip: '10.0.0.254', ports: 3,
  },
  userswitch1: {
    id: 'userswitch1', label: 'userswitch1', sublabel: 's3',
    type: 'switch', x: 235, y: 335,
    ip: '10.0.1.254', ports: 3,
  },
  switch2: {
    id: 'switch2', label: 'Switch2', sublabel: 's4',
    type: 'switch', x: 380, y: 335,
    ip: '10.0.2.254', ports: 3,
  },
  switch1: {
    id: 'switch1', label: 'Switch1', sublabel: 's5',
    type: 'switch', x: 510, y: 335,
    ip: '10.0.3.254', ports: 3,
  },
  serverswitch: {
    id: 'serverswitch', label: 'serverswitch', sublabel: 's5',
    type: 'switch', x: 660, y: 335,
    ip: '10.0.2.254', ports: 4,
  },
  dmzswitch: {
    id: 'dmzswitch', label: 'DMZswitch', sublabel: 's6',
    type: 'switch', x: 840, y: 335,
    ip: '172.16.0.254', ports: 3,
  },
  internetedgeswitch: {
    id: 'internetedgeswitch', label: 'internetedge\nswitch', sublabel: 's7',
    type: 'switch', x: 1020, y: 335,
    ip: '192.168.100.254', ports: 8,
  },

  // ── Hosts under userswitch ──
  pc5:  { id:'pc5',  label:'PC5',  sublabel:'10.0.0.10', type:'host', x:60,  y:470, connected_to:'userswitch' },
  pc1:  { id:'pc1',  label:'PC1',  sublabel:'10.0.0.11', type:'host', x:150, y:470, connected_to:'userswitch' },

  // ── Hosts under userswitch1 ──
  pc8:  { id:'pc8',  label:'PC8',  sublabel:'10.0.1.10', type:'host', x:193, y:470, connected_to:'userswitch1' },
  pc6:  { id:'pc6',  label:'PC6',  sublabel:'10.0.1.11', type:'host', x:278, y:470, connected_to:'userswitch1' },

  // ── Hosts under switch2 ──
  admin1:{ id:'admin1',label:'ADMIN',sublabel:'10.0.2.10',type:'host', x:333, y:470, connected_to:'switch2' },
  admin2:{ id:'admin2',label:'admin',sublabel:'10.0.2.11',type:'host', x:418, y:470, connected_to:'switch2' },

  // ── Hosts under switch1 ──
  pc16: { id:'pc16', label:'PC16', sublabel:'10.0.3.10', type:'host', x:465, y:470, connected_to:'switch1' },
  pc15: { id:'pc15', label:'PC15', sublabel:'10.0.3.11', type:'host', x:554, y:470, connected_to:'switch1' },

  // ── Hosts under serverswitch ──
  mail_srv: { id:'mail_srv', label:'GMAIL\nSERVER', sublabel:'10.0.2.10', type:'server', x:612, y:470, connected_to:'serverswitch' },
  file_srv:  { id:'file_srv',  label:'SERVER3',    sublabel:'10.0.2.20', type:'server', x:678, y:470, connected_to:'serverswitch' },
  web_srv2:  { id:'web_srv2',  label:'SERVER2',    sublabel:'10.0.2.30', type:'server', x:740, y:470, connected_to:'serverswitch' },

  // ── Hosts under dmzswitch ──
  dmzserver1:{ id:'dmzserver1',label:'DMZSERVER1', sublabel:'172.16.0.10', type:'server', x:795, y:470, connected_to:'dmzswitch' },
  web_srv:   { id:'web_srv',   label:'WEBSERVER',  sublabel:'172.16.0.20', type:'server', x:880, y:470, connected_to:'dmzswitch' },

  // ── PC11 under internetedgeswitch ──
  pc11: { id:'pc11', label:'PC11', sublabel:'192.168.100.5', type:'host', x:953, y:470, connected_to:'internetedgeswitch' },

  // ── 6 Attackers under internetedgeswitch ──
  ddos_att:  { id:'ddos_att',  label:'DDoS\nAttacker',  sublabel:'192.168.100.30', type:'attacker', role:'ddos',    x:965, y:590, connected_to:'internetedgeswitch' },
  arp_att:   { id:'arp_att',   label:'ARP\nSpoofer',    sublabel:'192.168.100.40', type:'attacker', role:'arp',     x:1008,y:530, connected_to:'internetedgeswitch' },
  scan_att:  { id:'scan_att',  label:'Scanner',         sublabel:'192.168.100.50', type:'attacker', role:'scan',    x:1055,y:590, connected_to:'internetedgeswitch' },
  brute_att: { id:'brute_att', label:'Brute\nForce',    sublabel:'192.168.100.60', type:'attacker', role:'brute',   x:1100,y:530, connected_to:'internetedgeswitch' },
  icmp_att:  { id:'icmp_att',  label:'ICMP\nAttacker',  sublabel:'192.168.100.70', type:'attacker', role:'icmp',    x:1145,y:590, connected_to:'internetedgeswitch' },
  pub_user:  { id:'pub_user',  label:'Public\nUser',    sublabel:'192.168.100.20', type:'host',     role:'user',    x:1188,y:530, connected_to:'internetedgeswitch' },
};

// Static edges from the diagram
const STATIC_EDGES = [
  // Controller → CoreSwitch  (OpenFlow, dashed)
  { from:'controller', to:'s1', style:'openflow', label:'openflow' },
  // CoreSwitch → all access switches
  { from:'s1', to:'userswitch' },
  { from:'s1', to:'userswitch1' },
  { from:'s1', to:'switch2' },
  { from:'s1', to:'switch1' },
  { from:'s1', to:'serverswitch' },
  { from:'s1', to:'dmzswitch' },
  { from:'s1', to:'internetedgeswitch' },
  // userswitch hosts
  { from:'userswitch', to:'pc5' },
  { from:'userswitch', to:'pc1' },
  // userswitch1 hosts
  { from:'userswitch1', to:'pc8' },
  { from:'userswitch1', to:'pc6' },
  // switch2 hosts
  { from:'switch2', to:'admin1' },
  { from:'switch2', to:'admin2' },
  // switch1 hosts
  { from:'switch1', to:'pc16' },
  { from:'switch1', to:'pc15' },
  // serverswitch hosts
  { from:'serverswitch', to:'mail_srv' },
  { from:'serverswitch', to:'file_srv' },
  { from:'serverswitch', to:'web_srv2' },
  // dmzswitch hosts
  { from:'dmzswitch', to:'dmzserver1' },
  { from:'dmzswitch', to:'web_srv' },
  // internetedgeswitch hosts + attackers
  { from:'internetedgeswitch', to:'pc11' },
  { from:'internetedgeswitch', to:'ddos_att' },
  { from:'internetedgeswitch', to:'arp_att' },
  { from:'internetedgeswitch', to:'scan_att' },
  { from:'internetedgeswitch', to:'brute_att' },
  { from:'internetedgeswitch', to:'icmp_att' },
  { from:'internetedgeswitch', to:'pub_user' },
];

// Map backend host IDs → our fixed node IDs
const HOST_ID_MAP = {
  user1:'pc5', user2:'pc1', user3:'pc8', user4:'pc6',
  user5:'pc16', user6:'pc15',
  mail_srv:'mail_srv', file_srv:'file_srv', web_srv:'web_srv',
  ddos_att:'ddos_att', arp_att:'arp_att', scan_att:'scan_att',
  brute_att:'brute_att', icmp_att:'icmp_att',
  attacker:'ddos_att', pub_user:'pub_user',
  pc5:'pc5', pc1:'pc1', pc8:'pc8', pc6:'pc6', pc16:'pc16', pc15:'pc15',
  admin1:'admin1', admin2:'admin2', dmzserver1:'dmzserver1', web_srv2:'web_srv2',
  gmailserver:'mail_srv', server3:'file_srv', server2:'web_srv2',
};

// Resolve a backend host id to a node id in FIXED_NODES
function resolveNode(id) {
  if (!id) return null;
  const mapped = HOST_ID_MAP[id];
  if (mapped && FIXED_NODES[mapped]) return mapped;
  if (FIXED_NODES[id]) return id;
  // fuzzy: partial match
  const lower = id.toLowerCase();
  const keys = Object.keys(FIXED_NODES);
  return keys.find(k => k.includes(lower) || lower.includes(k)) || null;
}

// Build a path of node-ids from src to dst through the topology
function buildPath(srcId, dstId) {
  const n = FIXED_NODES;
  if (!n[srcId] || !n[dstId]) return [srcId, dstId];
  const srcSwitch = n[srcId]?.connected_to;
  const dstSwitch = n[dstId]?.connected_to;

  const path = [srcId];
  // go up from src to its switch
  if (srcSwitch && srcSwitch !== srcId) path.push(srcSwitch);
  // if not both on coreswitch or same switch, go through core
  if (srcSwitch !== dstSwitch) {
    // src switch → coreswitch (unless srcSwitch IS coreswitch)
    if (srcSwitch && srcSwitch !== 's1') path.push('s1');
    // coreswitch → dst switch (unless dst switch IS coreswitch)
    if (dstSwitch && dstSwitch !== 's1') path.push(dstSwitch);
  }
  path.push(dstId);
  return path;
}

// ─── Color palette ──────────────────────────────────────────────────────────
const COLORS = {
  controller:  { bg:'#fff9e6', border:'#d97706', text:'#92400e' },
  coreswitch:  { bg:'#e0f2fe', border:'#0284c7', text:'#075985' },
  switch:      { bg:'#f0f9ff', border:'#0ea5e9', text:'#0c4a6e' },
  host:        { bg:'#f0fdf4', border:'#16a34a', text:'#14532d' },
  server:      { bg:'#eff6ff', border:'#2563eb', text:'#1e3a8a' },
  attacker:    { bg:'#fef2f2', border:'#dc2626', text:'#7f1d1d' },
};

// ─── SVG Icon components ────────────────────────────────────────────────────
function SwitchIcon({ cx, cy, w=36, h=24, color }) {
  return (
    <g>
      <rect x={cx-w/2} y={cy-h/2} width={w} height={h} rx={4}
        fill={color.bg} stroke={color.border} strokeWidth={1.5}/>
      {/* port bumps */}
      {[0,1,2,3].map(i=>(
        <rect key={i} x={cx-w/2+4+i*8} y={cy-h/2-4} width={5} height={4} rx={1} fill={color.border}/>
      ))}
      {/* arrows */}
      <text x={cx} y={cy+4} textAnchor="middle" fontSize="9" fill={color.border} fontFamily="monospace">⇄</text>
    </g>
  );
}

function ControllerIcon({ cx, cy, color }) {
  return (
    <g>
      <rect x={cx-52} y={cy-30} width={104} height={60} rx={4}
        fill={color.bg} stroke={color.border} strokeWidth={2}/>
      {/* inner VPCS box */}
      <rect x={cx-25} y={cy-16} width={50} height={20} rx={2}
        fill="#dbeafe" stroke="#3b82f6" strokeWidth={1}/>
      <text x={cx} y={cy-3} textAnchor="middle" fontSize="8" fill="#1d4ed8" fontWeight="700">VPCS</text>
    </g>
  );
}

function PCIcon({ cx, cy, color, isAttacker }) {
  return (
    <g>
      {/* Monitor */}
      <rect x={cx-18} y={cy-18} width={36} height={26} rx={2}
        fill={color.bg} stroke={color.border} strokeWidth={isAttacker?2:1.5}/>
      {/* Screen */}
      <rect x={cx-14} y={cy-15} width={28} height={18} rx={1}
        fill={isAttacker?'#fee2e2':'#dbeafe'}/>
      {/* Stand */}
      <rect x={cx-3} y={cy+8} width={6} height={5} fill={color.border}/>
      <rect x={cx-8} y={cy+12} width={16} height={3} rx={1} fill={color.border}/>
      {/* VPCS label inside screen */}
      <text x={cx} y={cy-4} textAnchor="middle" fontSize="6" fill={isAttacker?'#dc2626':'#1d4ed8'} fontWeight="700">VPCS</text>
    </g>
  );
}

// ─── Main Topology Canvas ────────────────────────────────────────────────────
function TopologyCanvas({ controllerOnline, mininetOnline, pingFlows }) {
  const svgRef = useRef(null);
  const [zoom, setZoom]   = useState(1);
  const [pan, setPan]     = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState(null);
  const [tick, setTick]   = useState(0);
  const dragging = useRef(false);
  const lastPos  = useRef({ x:0, y:0 });

  // Animation tick every 50ms for smooth dot movement
  useEffect(() => {
    const t = setInterval(() => setTick(x => x+1), 50);
    return () => clearInterval(t);
  }, []);

  // Build active ping animations
  const activeAnimations = React.useMemo(() => {
    const now = Date.now();
    return pingFlows
      .filter(p => now - new Date(p.timestamp).getTime() < PING_VISIBLE_MS)
      .map(ping => {
        const age   = now - new Date(ping.timestamp).getTime();
        const srcRaw = ping.src_host || ping.src || '';
        const dstRaw = ping.dst_host || ping.dst || '';
        const srcId  = resolveNode(srcRaw);
        const dstId  = resolveNode(dstRaw);
        if (!srcId || !dstId || srcId === dstId) return null;
        const path    = buildPath(srcId, dstId);
        const isAttack = ping.attack_detected ||
          ATTACKER_ROLES.includes((FIXED_NODES[srcId]?.role || '').toLowerCase()) ||
          ATTACKER_ROLES.includes((FIXED_NODES[srcId]?.type || '').toLowerCase());

        // Calculate animated dot position along the multi-hop path
        const cycleMs  = 2000;
        const elapsed  = age % cycleMs;
        const progress = elapsed / cycleMs; // 0→1 along total path

        // Compute segment points
        const points = path.map(id => {
          const n = FIXED_NODES[id];
          return n ? { x: n.x, y: n.y } : null;
        }).filter(Boolean);

        if (points.length < 2) return null;

        // Total path length
        let totalLen = 0;
        const segs = [];
        for (let i = 0; i < points.length-1; i++) {
          const dx = points[i+1].x - points[i].x;
          const dy = points[i+1].y - points[i].y;
          const len = Math.sqrt(dx*dx + dy*dy);
          segs.push({ dx, dy, len, x0:points[i].x, y0:points[i].y });
          totalLen += len;
        }

        let traveled = progress * totalLen;
        let dotX = points[0].x, dotY = points[0].y;
        for (const seg of segs) {
          if (traveled <= seg.len) {
            dotX = seg.x0 + (traveled/seg.len)*seg.dx;
            dotY = seg.y0 + (traveled/seg.len)*seg.dy;
            break;
          }
          traveled -= seg.len;
          dotX = seg.x0 + seg.dx;
          dotY = seg.y0 + seg.dy;
        }

        return {
          id: ping.id, path, points, srcId, dstId,
          dotX, dotY, isAttack,
          opacity: Math.max(0.2, 1 - age / PING_VISIBLE_MS),
          label: `${srcRaw} → ${dstRaw}`,
          ageMin: Math.floor(age / 60000),
          ageSec: Math.floor((age % 60000) / 1000),
        };
      })
      .filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pingFlows, tick]);

  const onWheel  = e => { e.preventDefault(); setZoom(z=>Math.min(3,Math.max(0.35,z-e.deltaY*0.001))); };
  const onMDown  = e => { dragging.current=true; lastPos.current={x:e.clientX,y:e.clientY}; };
  const onMMove  = e => { if (!dragging.current) return; setPan(p=>({x:p.x+e.clientX-lastPos.current.x,y:p.y+e.clientY-lastPos.current.y})); lastPos.current={x:e.clientX,y:e.clientY}; };
  const onMUp    = () => { dragging.current=false; };

  const W=1260, H=720;

  const renderNode = (node) => {
    const c = COLORS[node.type] || COLORS.host;
    const isAttacker = node.type === 'attacker';
    const isCore = node.type === 'coreswitch';
    const isCtrl = node.type === 'controller';
    const isSwitch = node.type === 'switch' || isCore;

    const lines = node.label.split('\n');

    return (
      <g key={node.id} style={{cursor:'pointer'}}
        onMouseEnter={e => {
          const r = svgRef.current?.getBoundingClientRect();
          setTooltip({ x:e.clientX-(r?.left||0), y:e.clientY-(r?.top||0), node });
        }}
        onMouseLeave={() => setTooltip(null)}>

        {/* Attacker glow ring */}
        {isAttacker && (
          <circle cx={node.x} cy={node.y} r={28}
            fill="rgba(220,38,38,0.10)" stroke="#dc2626"
            strokeWidth={1.5} strokeDasharray="4 3"
            style={{animation:'pulse 1.5s infinite'}}/>
        )}

        {/* Node icon */}
        {isCtrl
          ? <ControllerIcon cx={node.x} cy={node.y} color={c}/>
          : isSwitch
          ? <SwitchIcon cx={node.x} cy={node.y} w={isCore?44:38} h={isCore?28:22} color={c}/>
          : <PCIcon cx={node.x} cy={node.y} color={c} isAttacker={isAttacker}/>
        }

        {/* Online dot */}
        {!isCtrl && (
          <circle cx={node.x+20} cy={node.y-(isSwitch?15:20)} r={4}
            fill={isAttacker ? '#dc2626' : (controllerOnline ? '#22c55e' : '#ef4444')}
            stroke="#fff" strokeWidth={1}/>
        )}

        {/* Label above/below */}
        {lines.map((line, li) => (
          <text key={li}
            x={node.x}
            y={isCtrl
              ? node.y + 40 + li*12
              : isSwitch
              ? node.y + 22 + li*11
              : node.y + 22 + li*10
            }
            textAnchor="middle"
            fontSize={isCtrl?'10':isCore?'10':'9'}
            fontWeight={isCtrl||isCore?'700':'600'}
            fill={c.text}
            fontFamily="sans-serif">
            {line}
          </text>
        ))}

        {/* IP sublabel */}
        {node.sublabel && !isCtrl && (
          <text x={node.x} y={isSwitch ? node.y+32+(lines.length-1)*11 : node.y+32+(lines.length-1)*10}
            textAnchor="middle" fontSize="7.5" fill="#6b7280" fontFamily="monospace">
            {node.sublabel}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="position-relative"
      style={{background:'#fafafa',borderRadius:12,overflow:'hidden',border:'1px solid #e2e8f0',userSelect:'none'}}>

      {/* Controls */}
      <div className="position-absolute d-flex gap-1" style={{top:10,right:10,zIndex:20}}>
        <button className="btn btn-sm btn-light border shadow-sm" onClick={()=>setZoom(z=>Math.min(3,z+0.15))}>＋</button>
        <button className="btn btn-sm btn-light border shadow-sm" onClick={()=>setZoom(z=>Math.max(0.35,z-0.15))}>－</button>
        <button className="btn btn-sm btn-light border shadow-sm" onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>⊙</button>
      </div>

      {/* Status pill */}
      <div className="position-absolute d-flex align-items-center gap-2"
        style={{top:10,left:10,zIndex:20,background:'rgba(255,255,255,0.95)',borderRadius:20,padding:'4px 12px',border:'1px solid #e2e8f0',fontSize:12,boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>
        <span style={{width:8,height:8,borderRadius:'50%',background:mininetOnline?'#22c55e':'#ef4444',display:'inline-block',boxShadow:mininetOnline?'0 0 0 3px rgba(34,197,94,0.2)':'none'}}/>
        <span className="fw-semibold">Mininet</span>
        <span className={mininetOnline?'text-success':'text-danger'}>{mininetOnline?'Online':'Offline'}</span>
        <span className="text-muted mx-1">|</span>
        <span style={{width:8,height:8,borderRadius:'50%',background:controllerOnline?'#22c55e':'#ef4444',display:'inline-block',boxShadow:controllerOnline?'0 0 0 3px rgba(34,197,94,0.2)':'none'}}/>
        <span className="fw-semibold">Ryu</span>
        <span className={controllerOnline?'text-success':'text-danger'}>{controllerOnline?'Online':'Offline'}</span>
      </div>

      {/* Offline banner */}
      {(!mininetOnline||!controllerOnline) && (
        <div className="position-absolute" style={{top:46,left:'50%',transform:'translateX(-50%)',zIndex:20}}>
          <div className="d-flex align-items-center gap-2 px-4 py-2 rounded-pill shadow"
            style={{background:'rgba(220,38,38,0.93)',color:'#fff',fontSize:12,fontWeight:700,whiteSpace:'nowrap'}}>
            <i className="bi bi-exclamation-octagon-fill"/>
            SYSTEM {(!mininetOnline&&!controllerOnline)?'OFFLINE':!mininetOnline?'— Mininet Disconnected':'— Ryu Disconnected'}
          </div>
        </div>
      )}

      {/* Active flow labels */}
      {activeAnimations.length > 0 && (
        <div className="position-absolute d-flex flex-column gap-1"
          style={{bottom:10,left:10,zIndex:20,maxWidth:320}}>
          {activeAnimations.slice(0,5).map(anim=>(
            <div key={anim.id} className="d-flex align-items-center gap-2 px-3 py-1 rounded"
              style={{background:anim.isAttack?'rgba(220,38,38,0.9)':'rgba(22,163,74,0.88)',color:'#fff',fontSize:11,fontWeight:600,boxShadow:'0 1px 4px rgba(0,0,0,0.2)'}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:'#fff',display:'inline-block',flexShrink:0}}/>
              <span>{anim.label}</span>
              {anim.isAttack && <span className="badge bg-light text-danger ms-1" style={{fontSize:9}}>⚠ ATTACK</span>}
              <span className="ms-auto opacity-75" style={{fontSize:10}}>
                {anim.ageMin>0?`${anim.ageMin}m `:''}  {anim.ageSec}s ago
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{position:'absolute',left:tooltip.x+14,top:tooltip.y-10,zIndex:30,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',pointerEvents:'none',boxShadow:'0 4px 16px rgba(0,0,0,0.12)',minWidth:160,fontSize:12}}>
          <div className="fw-bold mb-1">{tooltip.node.label.replace('\n',' ')}</div>
          {tooltip.node.sublabel&&<div className="text-muted">IP: {tooltip.node.sublabel}</div>}
          {tooltip.node.ip&&<div className="text-muted">IP: {tooltip.node.ip}</div>}
          {tooltip.node.ports&&<div className="text-muted">Ports: {tooltip.node.ports}</div>}
          <div className="mt-1">
            <span className={`badge ${tooltip.node.type==='attacker'?'bg-danger':tooltip.node.type==='controller'?'bg-warning text-dark':tooltip.node.type==='server'?'bg-primary':'bg-secondary'}`}>
              {tooltip.node.type}
            </span>
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{width:'100%',height:580,cursor:dragging.current?'grabbing':'grab'}}
        onWheel={onWheel} onMouseDown={onMDown} onMouseMove={onMMove}
        onMouseUp={onMUp} onMouseLeave={onMUp}>

        <defs>
          {/* Arrow markers */}
          <marker id="arr-black" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#374151"/>
          </marker>
          <marker id="arr-green" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
            <path d="M0,0 L0,8 L9,4 z" fill="#16a34a"/>
          </marker>
          <marker id="arr-red" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
            <path d="M0,0 L0,8 L9,4 z" fill="#dc2626"/>
          </marker>
          <marker id="arr-blue" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#0284c7"/>
          </marker>
          {/* Glow filter */}
          <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Grid */}
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f0f0f0" strokeWidth="0.5"/>
          </pattern>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

          {/* Background grid */}
          <rect width={W} height={H} fill="url(#grid)"/>

          {/* ── Static Edges ── */}
          {STATIC_EDGES.map((e,i) => {
            const fn = FIXED_NODES[e.from], tn = FIXED_NODES[e.to];
            if (!fn||!tn) return null;
            const isOF = e.style === 'openflow';
            return (
              <g key={i}>
                <line
                  x1={fn.x} y1={fn.y} x2={tn.x} y2={tn.y}
                  stroke={isOF?'#0284c7':'#374151'}
                  strokeWidth={isOF?2:1.5}
                  strokeDasharray={isOF?'7 4':''}
                  opacity={0.8}
                  markerEnd={isOF?'url(#arr-blue)':undefined}
                />
                {/* OpenFlow label */}
                {isOF && (
                  <text x={(fn.x+tn.x)/2-30} y={(fn.y+tn.y)/2-8}
                    fontSize="11" fill="#0284c7" fontWeight="700" fontFamily="sans-serif"
                    style={{fontStyle:'italic'}}>
                    openflow
                  </text>
                )}
                {/* Green dots at endpoints (like GNS3 interface indicators) */}
                <circle cx={fn.x+(tn.x-fn.x)*0.25} cy={fn.y+(tn.y-fn.y)*0.25} r={3.5}
                  fill={controllerOnline?'#22c55e':'#ef4444'} stroke="#fff" strokeWidth={0.8}/>
                <circle cx={fn.x+(tn.x-fn.x)*0.75} cy={fn.y+(tn.y-fn.y)*0.75} r={3.5}
                  fill={controllerOnline?'#22c55e':'#ef4444'} stroke="#fff" strokeWidth={0.8}/>
              </g>
            );
          })}

          {/* ── Ping / Traffic Flow Animations ── */}
          {activeAnimations.map(anim => {
            const color = anim.isAttack ? '#dc2626' : '#16a34a';
            const filterId = anim.isAttack ? 'url(#glow-red)' : 'url(#glow-green)';
            const markEnd = anim.isAttack ? 'url(#arr-red)' : 'url(#arr-green)';

            // Draw the highlighted path segments
            return (
              <g key={anim.id} opacity={anim.opacity}>
                {/* Highlighted path */}
                {anim.points.map((pt, pi) => {
                  if (pi === anim.points.length-1) return null;
                  const next = anim.points[pi+1];
                  return (
                    <line key={pi}
                      x1={pt.x} y1={pt.y} x2={next.x} y2={next.y}
                      stroke={color} strokeWidth={anim.isAttack?3.5:2.5}
                      strokeDasharray={anim.isAttack?'10 5':''}
                      markerEnd={pi===anim.points.length-2?markEnd:undefined}
                      filter={filterId}
                    />
                  );
                })}
                {/* Moving dot */}
                <circle cx={anim.dotX} cy={anim.dotY} r={anim.isAttack?8:6}
                  fill={color} filter={filterId}/>
                <circle cx={anim.dotX} cy={anim.dotY} r={anim.isAttack?4:3}
                  fill="#fff"/>
                {/* Attack label near dot */}
                {anim.isAttack && (
                  <g>
                    <rect x={anim.dotX+10} y={anim.dotY-14} width={52} height={14} rx={3}
                      fill="rgba(220,38,38,0.85)"/>
                    <text x={anim.dotX+36} y={anim.dotY-4}
                      textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700">
                      ⚠ ATTACK
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ── Nodes (rendered last so they're on top) ── */}
          {Object.values(FIXED_NODES).map(renderNode)}

          {/* CoreSwitch special label */}
          <text x={FIXED_NODES.s1.x} y={FIXED_NODES.s1.y-18}
            textAnchor="middle" fontSize="14" fontWeight="800"
            fill="#075985" fontFamily="sans-serif">
            Coreswitch
          </text>

          {/* "openflow" italic label between controller and coreswitch */}
          <text x={FIXED_NODES.controller.x-90} y={(FIXED_NODES.controller.y+FIXED_NODES.s1.y)/2}
            fontSize="13" fill="#0284c7" fontWeight="700"
            style={{fontStyle:'italic'}} fontFamily="sans-serif">
            openflow
          </text>

        </g>
      </svg>

      <style>{`
        @keyframes pulse {
          0%,100%{opacity:1;} 50%{opacity:0.5;}
        }
      `}</style>
    </div>
  );
}

// ─── Status + Legend bar ─────────────────────────────────────────────────────
function StatusBar({ controllerOnline, mininetOnline, pingFlows }) {
  const attackFlows = pingFlows.filter(p => p.attack_detected ||
    ATTACKER_ROLES.includes((FIXED_NODES[resolveNode(p.src_host||p.src)]?.type||'').toLowerCase()));

  return (
    <div className="d-flex flex-wrap align-items-center gap-3 px-3 py-2"
      style={{background:'#f8fafc',borderTop:'1px solid #e2e8f0',fontSize:12}}>
      {/* Legend */}
      {[
        {label:'Ryu Controller',  color:'#d97706', shape:'rect'},
        {label:'Core Switch',     color:'#0284c7', shape:'rect'},
        {label:'Access Switch',   color:'#0ea5e9', shape:'rect'},
        {label:'Host / PC',       color:'#16a34a', shape:'circle'},
        {label:'Server',          color:'#2563eb', shape:'circle'},
        {label:'Attacker (×6)',   color:'#dc2626', shape:'circle'},
      ].map(({label,color,shape})=>(
        <div key={label} className="d-flex align-items-center gap-1">
          {shape==='rect'
            ? <span style={{width:14,height:10,borderRadius:2,background:color+'22',border:`2px solid ${color}`,display:'inline-block'}}/>
            : <span style={{width:11,height:11,borderRadius:'50%',background:color+'22',border:`2px solid ${color}`,display:'inline-block'}}/>
          }
          <span style={{color:'#374151'}}>{label}</span>
        </div>
      ))}
      <div className="d-flex align-items-center gap-1 ms-auto">
        <span style={{width:20,borderTop:'2.5px solid #16a34a',display:'inline-block'}}/>
        <span>Normal flow</span>
      </div>
      <div className="d-flex align-items-center gap-1">
        <span style={{width:20,borderTop:'2.5px dashed #dc2626',display:'inline-block'}}/>
        <span>Attack flow</span>
      </div>
      {pingFlows.length > 0 && (
        <div className="d-flex align-items-center gap-2 px-2 py-1 rounded"
          style={{background: attackFlows.length>0?'rgba(220,38,38,0.1)':'rgba(22,163,74,0.1)',border:`1px solid ${attackFlows.length>0?'#fca5a5':'#86efac'}`}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:attackFlows.length>0?'#dc2626':'#16a34a',display:'inline-block'}}/>
          <span>{pingFlows.length} active flow{pingFlows.length!==1?'s':''}</span>
          {attackFlows.length>0&&<span className="text-danger fw-bold">· {attackFlows.length} attack{attackFlows.length!==1?'s':''}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Attacker Summary Cards ──────────────────────────────────────────────────
const ATTACKER_INFO = {
  ddos_att:  { label:'DDoS Attacker',     color:'#dc2626', icon:'bi-cloud-lightning-rain-fill', desc:'Distributed Denial of Service',   ip:'192.168.100.30' },
  arp_att:   { label:'ARP Spoofer',        color:'#ea580c', icon:'bi-arrow-left-right',           desc:'ARP Cache Poisoning',             ip:'192.168.100.40' },
  scan_att:  { label:'Port Scanner',       color:'#d97706', icon:'bi-search',                     desc:'Network Reconnaissance / Scan',   ip:'192.168.100.50' },
  brute_att: { label:'Brute Force',        color:'#7c3aed', icon:'bi-key-fill',                   desc:'Password Brute Force Attack',     ip:'192.168.100.60' },
  icmp_att:  { label:'ICMP Attacker',      color:'#0891b2', icon:'bi-reception-4',                desc:'ICMP Flood / Ping of Death',      ip:'192.168.100.70' },
  attacker:  { label:'External Attacker',  color:'#be185d', icon:'bi-person-x-fill',              desc:'Generic External Threat',         ip:'192.168.100.10' },
};

function AttackerCards({ pingFlows }) {
  return (
    <div className="row g-3 mt-2">
      {Object.entries(ATTACKER_INFO).map(([id, info]) => {
        const flows = pingFlows.filter(p => (p.src_host||p.src||'').toLowerCase() === id);
        const active = flows.length > 0;
        return (
          <div key={id} className="col-6 col-md-4 col-xl-2">
            <div className="card h-100 shadow-sm"
              style={{borderTop:`4px solid ${info.color}`,borderLeft:active?`2px solid ${info.color}`:'',background:active?`${info.color}08`:'#fff'}}>
              <div className="card-body p-2">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <i className={`bi ${info.icon}`} style={{color:info.color,fontSize:16}}/>
                  {active && <span className="badge ms-auto" style={{background:info.color,fontSize:9}}>ACTIVE</span>}
                </div>
                <div className="fw-bold" style={{fontSize:11,color:info.color}}>{info.label}</div>
                <div className="text-muted" style={{fontSize:10}}>{info.desc}</div>
                <div className="mt-1" style={{fontSize:10,fontFamily:'monospace',color:'#6b7280'}}>{info.ip}</div>
                {active && (
                  <div className="mt-1 pt-1 border-top">
                    <div className="text-danger fw-bold" style={{fontSize:10}}>
                      {flows.length} flow{flows.length!==1?'s':''} detected
                    </div>
                    <div className="text-muted" style={{fontSize:9}}>
                      → {(flows[0]?.dst_host||flows[0]?.dst||'?')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────
export default function Topology() {
  const [controllerOnline, setControllerOnline] = useState(false);
  const [mininetOnline, setMininetOnline]       = useState(false);
  const [pingFlows, setPingFlows]               = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [refreshing, setRefreshing]             = useState(false);
  const [stats, setStats]                       = useState({});

  const fetchAll = useCallback(async () => {
    try {
      const [mininetRes, ctrlRes] = await Promise.all([
        mininetAPI.getStatus(),
        controllerAPI.getStatus(),
      ]);
      const mn   = mininetRes.data || {};
      const ctrl = ctrlRes.data || {};
      setMininetOnline(mn.connected===true||mn.status==='running'||mn.status==='connected'||(Array.isArray(mn.hosts)&&mn.hosts.length>0));
      setControllerOnline(ctrl.controller_connected===true||ctrl.connected===true||ctrl.status==='connected'||ctrl.status==='running');
      setStats({ switches: ctrl.switches?.length||0, hosts: ctrl.hosts?.length||0, alerts: ctrl.alert_count||0, blocked: ctrl.blocked_ips||0 });
    } catch {
      setControllerOnline(false);
      setMininetOnline(false);
    }

    try {
      const pingsRes = await pingAPI.getAll({ limit: 100 });
      const pings = pingsRes.data || [];
      const now   = Date.now();
      setPingFlows(pings.filter(p => now - new Date(p.timestamp).getTime() < PING_VISIBLE_MS));
    } catch { /* no-op */ }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    // Purge old pings every 30s
    const purge = setInterval(() => {
      const now = Date.now();
      setPingFlows(prev => prev.filter(p => now - new Date(p.timestamp).getTime() < PING_VISIBLE_MS));
    }, 30000);
    return () => { clearInterval(interval); clearInterval(purge); };
  }, [fetchAll]);

  if (loading) return (
    <div className="p-5 text-center">
      <div className="spinner-border text-primary" role="status"/>
      <p className="mt-3 text-muted">Loading topology...</p>
    </div>
  );

  const attackFlows = pingFlows.filter(p => p.attack_detected ||
    ATTACKER_ROLES.includes((FIXED_NODES[resolveNode(p.src_host||p.src)]?.type||'').toLowerCase()));

  return (
    <div className="container-fluid p-4">

      {/* ── Header ── */}
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-4">
        <div>
          <h2 className="mb-1 d-flex align-items-center gap-2">
            <i className="bi bi-diagram-3"/>
            Network Topology
            {attackFlows.length > 0 && (
              <span className="badge bg-danger ms-1" style={{fontSize:13,animation:'pulse 1.5s infinite'}}>
                <i className="bi bi-exclamation-triangle-fill me-1"/>{attackFlows.length} Attack Flow{attackFlows.length!==1?'s':''}
              </span>
            )}
          </h2>
          <p className="text-muted mb-0">
            Live SDN topology — Ryu Controller → Coreswitch → 7 Switches → Hosts &amp; 6 Attacker types.
            Ping flows shown for 3 minutes with animated direction.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-outline-secondary"
            onClick={async()=>{setRefreshing(true);await fetchAll();setRefreshing(false);}}
            disabled={refreshing}>
            <i className="bi bi-arrow-clockwise me-1"/>Refresh
          </button>
        </div>
      </div>

      {/* ── Quick stats ── */}
      <div className="d-flex flex-wrap gap-3 mb-3">
        {[
          { label:'Ryu Controller',   online:controllerOnline },
          { label:'Mininet',          online:mininetOnline },
        ].map(({label,online})=>(
          <div key={label} className="d-flex align-items-center gap-2 px-3 py-2 rounded"
            style={{background:online?'rgba(22,163,74,0.07)':'rgba(220,38,38,0.07)',border:`1px solid ${online?'#86efac':'#fca5a5'}`}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:online?'#22c55e':'#ef4444',display:'inline-block'}}/>
            <span className="fw-semibold small">{label}</span>
            <span className={`badge ${online?'bg-success':'bg-danger'}`} style={{fontSize:10}}>{online?'Online':'Offline'}</span>
          </div>
        ))}
        {[
          {label:'Switches',       val:7,                  icon:'bi-hdd-stack',            color:'#0284c7'},
          {label:'Hosts',          val:Object.values(FIXED_NODES).filter(n=>n.type==='host'||n.type==='server').length, icon:'bi-pc-display', color:'#16a34a'},
          {label:'Attackers',      val:6,                  icon:'bi-exclamation-triangle', color:'#dc2626'},
          {label:'Active Flows',   val:pingFlows.length,   icon:'bi-activity',             color:'#7c3aed'},
          {label:'Attack Flows',   val:attackFlows.length, icon:'bi-lightning-fill',       color:'#dc2626'},
        ].map(({label,val,icon,color})=>(
          <div key={label} className="d-flex align-items-center gap-2 px-3 py-2 rounded bg-white border">
            <i className={`bi ${icon}`} style={{color}}/>
            <span className="fw-bold small" style={{color}}>{val}</span>
            <span className="text-muted small">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Main topology canvas ── */}
      <div className="card shadow mb-4">
        <div className="card-header d-flex align-items-center justify-content-between"
          style={{background: attackFlows.length>0?'#7f1d1d':'#0f172a', color:'#fff'}}>
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-diagram-3"/>
            <strong>Live Network Diagram</strong>
            <span className="badge bg-secondary" style={{fontSize:10}}>Scroll/pinch to zoom · Drag to pan</span>
          </div>
          {pingFlows.length>0 && (
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-success" style={{fontSize:10}}>
                <i className="bi bi-activity me-1"/>{pingFlows.length} flow{pingFlows.length!==1?'s':''} visible
              </span>
              {attackFlows.length>0 && (
                <span className="badge bg-danger" style={{fontSize:10,animation:'pulse 1s infinite'}}>
                  ⚠ {attackFlows.length} ATTACK{attackFlows.length!==1?'S':''}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="card-body p-0">
          <TopologyCanvas
            controllerOnline={controllerOnline}
            mininetOnline={mininetOnline}
            pingFlows={pingFlows}
          />
          <StatusBar
            controllerOnline={controllerOnline}
            mininetOnline={mininetOnline}
            pingFlows={pingFlows}
          />
        </div>
      </div>

      {/* ── 6 Attacker type cards ── */}
      <div className="mb-2">
        <h5 className="d-flex align-items-center gap-2">
          <i className="bi bi-shield-exclamation text-danger"/>
          Attacker Nodes
          <span className="badge bg-secondary ms-1" style={{fontSize:11}}>6 types connected to internetedgeswitch</span>
          {attackFlows.length>0 && <span className="badge bg-danger ms-1" style={{fontSize:11,animation:'pulse 1.2s infinite'}}>{attackFlows.length} Active Attack{attackFlows.length!==1?'s':''}</span>}
        </h5>
        <p className="text-muted small mb-2">
          All 6 attacker types are connected to the Internet Edge Switch. When you run e.g.
          <code className="ms-1 me-1">ddos_att ping file_srv</code>
          in Mininet, the animated path appears above routing through: ddos_att → internetedgeswitch → Coreswitch → serverswitch → file_srv
        </p>
      </div>
      <AttackerCards pingFlows={pingFlows}/>

      {/* ── Flow history table ── */}
      {pingFlows.length > 0 && (
        <div className="card shadow mt-4">
          <div className="card-header d-flex align-items-center gap-2" style={{background:'#0f172a',color:'#fff'}}>
            <i className="bi bi-clock-history"/>
            <strong>Active Message Flows</strong>
            <span className="badge bg-secondary ms-auto">{pingFlows.length}</span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0">
                <thead className="table-light">
                  <tr><th>Source</th><th>Destination</th><th>Path</th><th>Status</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {pingFlows.slice().reverse().map(p => {
                    const srcId = resolveNode(p.src_host||p.src||'');
                    const dstId = resolveNode(p.dst_host||p.dst||'');
                    const path  = srcId&&dstId ? buildPath(srcId,dstId) : [];
                    const isAtk = p.attack_detected||ATTACKER_ROLES.includes((FIXED_NODES[srcId]?.type||'').toLowerCase());
                    const age   = Math.floor((Date.now()-new Date(p.timestamp).getTime())/1000);
                    return (
                      <tr key={p.id} style={{background:isAtk?'rgba(220,38,38,0.04)':undefined}}>
                        <td><code className={isAtk?'text-danger fw-bold':''}>{p.src_host||p.src||'—'}</code></td>
                        <td><code>{p.dst_host||p.dst||'—'}</code></td>
                        <td>
                          <div className="d-flex align-items-center gap-1 flex-wrap">
                            {path.map((nid,pi)=>(
                              <span key={pi} className="d-flex align-items-center gap-1">
                                <code style={{fontSize:10,background:'#f1f5f9',padding:'1px 4px',borderRadius:3}}>{nid}</code>
                                {pi<path.length-1&&<span className={`${isAtk?'text-danger':'text-success'}`}>→</span>}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {isAtk
                            ? <span className="badge bg-danger">⚠ Attack</span>
                            : <span className="badge bg-success">Normal</span>
                          }
                        </td>
                        <td className="text-muted small">{age<60?`${age}s ago`:`${Math.floor(age/60)}m ${age%60}s ago`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}