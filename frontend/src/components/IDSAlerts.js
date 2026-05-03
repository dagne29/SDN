import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { idsAPI, pingAPI } from '../services/api';

const severityOptions = ['all', 'Critical', 'High', 'Medium', 'Low'];
const statusOptions   = ['all', 'new', 'acknowledged', 'blocked', 'resolved'];
const ATTACKER_ROLES  = ['attacker','ddos','syn','arp','scan','brute','icmp'];

// ─── Voice alert (ambulance siren) ──────────────────────────────────────────

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const duration = 2.5;
    // Two-tone sweeping siren
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = 'sawtooth';
    osc2.type = 'square';

    // Sweep high-low like an ambulance
    const cycles = 3;
    for (let i = 0; i < cycles; i++) {
      const t = ctx.currentTime + (i * duration / cycles);
      osc1.frequency.setValueAtTime(880, t);
      osc1.frequency.linearRampToValueAtTime(440, t + duration / (cycles * 2));
      osc1.frequency.linearRampToValueAtTime(880, t + duration / cycles);
      osc2.frequency.setValueAtTime(920, t);
      osc2.frequency.linearRampToValueAtTime(460, t + duration / (cycles * 2));
      osc2.frequency.linearRampToValueAtTime(920, t + duration / cycles);
    }

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + duration);
    osc2.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Audio alert failed:', e);
  }
}

// ─── Badges ─────────────────────────────────────────────────────────────────

function SeverityBadge({ severity }) {
  const map = { Critical:'danger', High:'warning', Medium:'info', Low:'secondary' };
  return <span className={`badge bg-${map[severity]||'dark'}`}>{severity||'Unknown'}</span>;
}

function StatusBadge({ status }) {
  const map = { new:'danger', acknowledged:'warning text-dark', blocked:'dark', resolved:'success' };
  return <span className={`badge bg-${map[(status||'new').toLowerCase()]||'secondary'}`}>{status||'new'}</span>;
}

function PingStatusBadge({ status }) {
  const n = (status||'unknown').toLowerCase();
  const map = { success:'success', failed:'danger', degraded:'warning text-dark', unknown:'secondary' };
  return <span className={`badge bg-${map[n]||'secondary'}`}>{n}</span>;
}

// ─── Severity Donut ──────────────────────────────────────────────────────────

function SeverityDonut({ counts }) {
  const items = [
    { label:'Critical', color:'#dc3545', val:counts.severity?.Critical||0 },
    { label:'High',     color:'#fd7e14', val:counts.severity?.High||0 },
    { label:'Medium',   color:'#0dcaf0', val:counts.severity?.Medium||0 },
    { label:'Low',      color:'#6c757d', val:counts.severity?.Low||0 },
  ];
  const total = items.reduce((s,i) => s+i.val, 0)||1;
  const r=60, cx=80, cy=80, stroke=22, circ=2*Math.PI*r;
  let offset=0;
  return (
    <div className="d-flex align-items-center gap-4">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke}/>
        {items.map(item => {
          const dashLen=(item.val/total)*circ;
          const dashOff=-offset;
          offset+=dashLen;
          return (
            <circle key={item.label} cx={cx} cy={cy} r={r} fill="none"
              stroke={item.color} strokeWidth={stroke}
              strokeDasharray={`${dashLen} ${circ-dashLen}`}
              strokeDashoffset={dashOff}
              style={{transition:'stroke-dasharray 0.5s ease'}}
              transform={`rotate(-90 ${cx} ${cy})`}>
              <title>{item.label}: {item.val}</title>
            </circle>
          );
        })}
        <text x={cx} y={cy-6} textAnchor="middle" fontSize="22" fontWeight="700" fill="#1e293b">{total}</text>
        <text x={cx} y={cy+14} textAnchor="middle" fontSize="11" fill="#64748b">alerts</text>
      </svg>
      <div className="d-flex flex-column gap-2">
        {items.map(item=>(
          <div key={item.label} className="d-flex align-items-center gap-2">
            <span style={{width:10,height:10,borderRadius:'50%',background:item.color,display:'inline-block',flexShrink:0}}/>
            <span className="small text-muted">{item.label}</span>
            <span className="fw-bold small ms-1">{item.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Attack timeline ─────────────────────────────────────────────────────────

function AttackTimeline({ alerts }) {
  const items = alerts.slice().sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0,12);
  if (!items.length) return <div className="text-muted small py-2">No attack events recorded.</div>;
  return (
    <div className="position-relative" style={{paddingLeft:28}}>
      <div style={{position:'absolute',left:9,top:0,bottom:0,width:2,background:'#e2e8f0'}}/>
      {items.map((alert,i)=>{
        const isAttack=(alert.source_host||'').startsWith('atk_')||alert.severity==='Critical';
        return (
          <div key={alert.id||i} className="mb-3 position-relative">
            <div style={{position:'absolute',left:-20,top:4,width:10,height:10,borderRadius:'50%',background:isAttack?'#dc3545':alert.severity==='High'?'#fd7e14':'#6c757d',border:'2px solid #fff',zIndex:1,boxShadow:isAttack?'0 0 0 3px rgba(220,53,69,0.2)':'none'}}/>
            <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{alert.timestamp?new Date(alert.timestamp).toLocaleTimeString():'—'}</div>
            <div className="fw-semibold" style={{fontSize:13}}>{alert.type}</div>
            <div style={{fontSize:12,color:'#64748b'}}>{alert.source_host||alert.source_ip||'—'} → {alert.destination_host||alert.destination_ip||'—'}</div>
            <div className="d-flex gap-2 mt-1"><SeverityBadge severity={alert.severity}/><StatusBadge status={alert.status}/></div>
          </div>
        );
      })}
    </div>
  );
}

function summarizePingOutput(output) {
  const text=(output||'').trim();
  if (!text) return '';
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  return lines.find(l=>/Destination Host Unreachable/i.test(l))||lines.find(l=>/packet loss/i.test(l))||lines[lines.length-1]||'';
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function IDSAlerts() {
  const location = useLocation();

  const [alerts, setAlerts]           = useState([]);
  const [stats, setStats]             = useState(null);
  const [rules, setRules]             = useState([]);
  const [recentPings, setRecentPings] = useState([]);
  const [attackPings, setAttackPings] = useState([]);
  const [latestPing, setLatestPing]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [severityFilter, setSeverityFilter]   = useState('all');
  const [statusFilter, setStatusFilter]       = useState('all');
  const [historyLimit, setHistoryLimit]       = useState(10);
  const [actionMessage, setActionMessage]     = useState('');
  const [actionType, setActionType]           = useState('info');
  const [voiceEnabled, setVoiceEnabled]       = useState(true);
  const [alertBanner, setAlertBanner]         = useState(null); // { text, id }

  const lastAlertCountRef = useRef(0);
  const lastAttackerIdsRef = useRef(new Set());

  const showMessage = (msg, type='success') => {
    setActionMessage(msg);
    setActionType(type);
    setTimeout(()=>setActionMessage(''),4000);
  };

  // Detect new attacker alerts and trigger voice/banner
  const checkForNewAttackers = (newAlerts) => {
    const attackerAlerts = newAlerts.filter(a =>
      ATTACKER_ROLES.some(r => (a.source_host||'').toLowerCase().includes(r)) ||
      a.severity === 'Critical' ||
      (a.type||'').toLowerCase().includes('attack') ||
      (a.type||'').toLowerCase().includes('flood')
    );

    const newAttackerIds = new Set(attackerAlerts.map(a => a.id));
    const previousIds    = lastAttackerIdsRef.current;
    const novelIds       = [...newAttackerIds].filter(id => !previousIds.has(id));

    if (novelIds.length > 0) {
      const newAlert = attackerAlerts.find(a => a.id === novelIds[0]);
      const bannerText = `⚠ ATTACKER DETECTED: ${newAlert?.source_host || newAlert?.source_ip || 'Unknown'} → ${newAlert?.destination_host || newAlert?.destination_ip || 'Unknown'} [${newAlert?.type || 'Attack'}]`;
      setAlertBanner({ text: bannerText, id: novelIds[0] });
      if (voiceEnabled) playAlertSound();
      setTimeout(() => setAlertBanner(null), 12000);
    }

    lastAttackerIdsRef.current = newAttackerIds;
  };

  useEffect(() => {
    fetchAlertsData();
    const interval = setInterval(fetchAlertsData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAlertsData = async () => {
    let nextAlerts = [];
    try {
      const [alertsRes, statsRes, rulesRes] = await Promise.all([
        idsAPI.getAlerts(100),
        idsAPI.getStatistics(),
        idsAPI.getRules(),
      ]);
      nextAlerts = alertsRes.data || [];
      setAlerts(nextAlerts);
      setStats(statsRes.data || null);
      setRules(rulesRes.data || []);
      setSelectedAlertId(cur => cur || nextAlerts[0]?.id || null);
      checkForNewAttackers(nextAlerts);
    } catch (error) {
      console.error('Error fetching IDS data:', error);
    }
    try {
      const [pingsRes, latestPingRes] = await Promise.all([
        pingAPI.getAll({ limit: 100 }),
        pingAPI.getLatest(),
      ]);
      const nextPings = pingsRes.data || [];
      setRecentPings(nextPings);
      setAttackPings(nextPings.filter(p => Boolean(p?.attack_detected)));
      setLatestPing(latestPingRes.data || null);
    } catch (error) {
      console.error('Error fetching pings:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedAlert = useMemo(
    () => alerts.find(a => a.id === selectedAlertId) || alerts[0] || null,
    [alerts, selectedAlertId]
  );

  // Only show attacker-related alerts
  const attackerAlerts = useMemo(() => alerts.filter(a =>
    ATTACKER_ROLES.some(r => (a.source_host||'').toLowerCase().includes(r)) ||
    a.severity === 'Critical' || a.severity === 'High' ||
    (a.type||'').toLowerCase().includes('attack') ||
    (a.type||'').toLowerCase().includes('flood') ||
    (a.type||'').toLowerCase().includes('spoof') ||
    (a.type||'').toLowerCase().includes('scan') ||
    (a.type||'').toLowerCase().includes('brute')
  ), [alerts]);

  const filteredAlerts = useMemo(() => attackerAlerts.filter(a => {
    const sev = severityFilter === 'all' || a.severity === severityFilter;
    const sta = statusFilter   === 'all' || (a.status || 'new').toLowerCase() === statusFilter;
    return sev && sta;
  }), [attackerAlerts, severityFilter, statusFilter]);

  const counts = useMemo(() => alerts.reduce((acc, a) => {
    const sev = a.severity || 'Unknown';
    const sta = (a.status || 'new').toLowerCase();
    acc.severity[sev] = (acc.severity[sev] || 0) + 1;
    acc.status[sta]   = (acc.status[sta]   || 0) + 1;
    return acc;
  }, { severity: {}, status: {} }), [alerts]);

  const updateAlertStatus = async (alertId, action) => {
    if (!alertId) return;
    try {
      if (action === 'block')       await idsAPI.blockAlert(alertId);
      if (action === 'clear')       await idsAPI.clearAlert(alertId);
      if (action === 'acknowledge') await idsAPI.acknowledgeAlert(alertId);
      if (action === 'resolve')     await idsAPI.resolveAlert(alertId);
      showMessage(`Alert ${alertId} ${action}d successfully.`, 'success');
      await fetchAlertsData();
    } catch {
      showMessage(`Unable to ${action} alert ${alertId}.`, 'danger');
    }
  };

  const historyItems   = filteredAlerts.slice().reverse().slice(0, historyLimit);
  const activeCount    = counts.status.new || 0;
  const blockedCount   = counts.status.blocked || 0;
  const resolvedCount  = counts.status.resolved || 0;
  const criticalCount  = counts.severity.Critical || 0;

  const activeSection = useMemo(() => {
    const val = new URLSearchParams(location.search).get('section') || 'overview';
    const allowed = new Set(['overview','list','details','severity','status','actions','filters','history']);
    return allowed.has(val) ? val : 'overview';
  }, [location.search]);

  if (loading) return <div className="p-5 text-center">Loading alerts...</div>;

  const hasAttackers = attackerAlerts.length > 0 || attackPings.length > 0;

  return (
    <div className="container-fluid p-4">

      {/* ── Voice Alert Banner ── */}
      {alertBanner && (
        <div className="alert alert-danger d-flex align-items-center gap-3 mb-3 shadow-lg" role="alert"
          style={{borderLeft:'6px solid #7f1d1d',animation:'idsBannerSlide 0.3s ease',background:'rgba(220,53,69,0.1)'}}>
          <i className="bi bi-exclamation-octagon-fill text-danger fs-3"/>
          <div className="flex-grow-1">
            <div className="fw-bold fs-6">{alertBanner.text}</div>
            <div className="small text-muted mt-1">Controller has automatically blocked the attacker IP. Voice alert triggered.</div>
          </div>
          <button type="button" className="btn-close" onClick={() => setAlertBanner(null)}/>
        </div>
      )}

      {/* ── Header ── */}
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3">
        <div>
          <h2 className="mb-1 d-flex align-items-center gap-2">
            <i className="bi bi-shield-exclamation text-danger"/>
            IDS Alerts
            {attackerAlerts.length > 0 && (
              <span className="badge bg-danger ms-1" style={{fontSize:12,animation:'idsPulse 1.5s infinite'}}>
                {attackerAlerts.length} Attacker{attackerAlerts.length!==1?'s':''} Detected
              </span>
            )}
          </h2>
          <p className="text-muted mb-0">
            Intrusion Detection System — only displays when attackers are detected. Controller auto-blocks on detection.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <button type="button"
            className={`btn btn-sm ${voiceEnabled?'btn-danger':'btn-outline-secondary'}`}
            onClick={() => setVoiceEnabled(v => !v)}
            title={voiceEnabled?'Click to mute voice alerts':'Click to enable voice alerts'}>
            <i className={`bi ${voiceEnabled?'bi-volume-up-fill':'bi-volume-mute-fill'} me-1`}/>
            {voiceEnabled?'Voice Alert ON':'Voice Alert OFF'}
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary"
            onClick={async () => { setRefreshing(true); await fetchAlertsData(); setRefreshing(false); }}
            disabled={refreshing}>
            <i className="bi bi-arrow-clockwise me-1"/>Refresh
          </button>
        </div>
      </div>

      {/* ── No attackers placeholder ── */}
      {!hasAttackers && (
        <div className="card shadow-sm border-success mb-4">
          <div className="card-body d-flex align-items-center gap-4 py-4">
            <i className="bi bi-shield-check text-success" style={{fontSize:48}}/>
            <div>
              <div className="fw-bold fs-5 text-success">Network Secure — No Attackers Detected</div>
              <div className="text-muted mt-1">
                The IDS is actively monitoring traffic. This panel will show alerts as soon as an attacker or suspicious host is detected.
                Alerts are filtered to only show threats — normal traffic does not appear here.
              </div>
              <div className="mt-2 small text-muted">
                Checking every 5 seconds · {alerts.length} total events in log ({alerts.length - attackerAlerts.length} normal/filtered)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Only render alert content when there ARE attackers */}
      {hasAttackers && (
        <>
          {/* ── KPI row ── */}
          <div className="row g-3 mb-4">
            {[
              { title:'Attackers Detected', val:attackerAlerts.length, accent:'danger',  icon:'bi-exclamation-triangle', detail:'Active threat hosts' },
              { title:'Critical Alerts',    val:criticalCount, accent:'dark',    icon:'bi-fire',                 detail:'Highest-priority threats' },
              { title:'Unhandled',          val:activeCount,   accent:'warning', icon:'bi-bell',                 detail:'New / unacknowledged' },
              { title:'Attack Pings',       val:attackPings.length, accent:'danger', icon:'bi-lightning', detail:'Ping-based attacks' },
            ].map(({ title, val, accent, icon, detail }) => (
              <div key={title} className="col-12 col-sm-6 col-xl-3">
                <div className={`card h-100 border-${accent} shadow-sm`}>
                  <div className="card-body">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <i className={`bi ${icon} text-${accent}`}/>
                      <span className="text-muted small">{title}</span>
                    </div>
                    <div className={`fs-3 fw-bold text-${accent}`}>{val}</div>
                    <div className="small text-muted">{detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {actionMessage && (
            <div className={`alert alert-${actionType} py-2 mb-3`}>{actionMessage}</div>
          )}

          {/* ── OVERVIEW ── */}
          {activeSection === 'overview' && (
            <div className="row g-4">
              <div className="col-12 col-lg-5">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-dark text-white d-flex align-items-center gap-2">
                    <i className="bi bi-pie-chart"/><strong>Severity Distribution</strong>
                  </div>
                  <div className="card-body">
                    <SeverityDonut counts={counts}/>
                    <hr/>
                    <div className="d-flex flex-column gap-1 mt-2">
                      {[
                        { label:'New',          val:counts.status.new||0 },
                        { label:'Acknowledged', val:counts.status.acknowledged||0 },
                        { label:'Blocked',      val:blockedCount },
                        { label:'Resolved',     val:resolvedCount },
                        { label:'Attack Pings', val:attackPings.length },
                      ].map(({ label, val }) => (
                        <div key={label} className="d-flex justify-content-between small">
                          <span className="text-muted">{label}</span>
                          <span className="fw-semibold">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-lg-7">
                <div className="card shadow-sm mb-3">
                  <div className="card-header bg-danger text-white d-flex align-items-center gap-2">
                    <i className="bi bi-clock-history"/><strong>Attack Timeline</strong>
                    <span className="badge bg-light text-danger ms-auto">{attackerAlerts.length} events</span>
                  </div>
                  <div className="card-body" style={{maxHeight:300,overflowY:'auto'}}>
                    <AttackTimeline alerts={attackerAlerts}/>
                  </div>
                </div>

                <div className="card shadow-sm">
                  <div className="card-header bg-danger text-white d-flex align-items-center gap-2">
                    <i className="bi bi-router"/><strong>Latest Attacker Ping</strong>
                  </div>
                  <div className="card-body">
                    {attackPings[0] ? (
                      <div className="d-flex justify-content-between gap-2">
                        <div>
                          <div className="fw-semibold text-danger">
                            {attackPings[0].src_host||attackPings[0].src||'—'} → {attackPings[0].dst_host||attackPings[0].dst||'—'}
                          </div>
                          <div className="small text-muted">
                            {attackPings[0].status} · {attackPings[0].round_trip_time||(attackPings[0].latency_ms!=null?`${attackPings[0].latency_ms} ms`:'—')} · {attackPings[0].timestamp}
                          </div>
                          <span className="badge bg-danger mt-1">Attack Detected — IP Blocked</span>
                        </div>
                        <code className="small text-muted">{attackPings[0].command||'ping'}</code>
                      </div>
                    ) : (
                      <div className="text-muted small">No attack pings yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── LIST ── */}
          {activeSection === 'list' && (
            <div className="row g-4">
              <div className="col-12 col-xl-5">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
                    <strong>Attacker Alerts</strong>
                    <span className="badge bg-danger">{filteredAlerts.length}</span>
                  </div>
                  <div className="card-body p-2">
                    <p className="text-muted small mb-2 px-1">Only attacker/threat-origin alerts are shown.</p>
                    <div className="list-group" style={{maxHeight:'68vh',overflowY:'auto'}}>
                      {filteredAlerts.length ? filteredAlerts.map(alert => (
                        <button key={alert.id} type="button"
                          className={`list-group-item list-group-item-action ${selectedAlert?.id===alert.id?'active':''}`}
                          onClick={()=>setSelectedAlertId(alert.id)} style={{textAlign:'left'}}>
                          <div className="d-flex justify-content-between align-items-start gap-2">
                            <div>
                              <div className="fw-semibold">{alert.type}</div>
                              <div className="small opacity-75">{alert.source_host} → {alert.destination_host}</div>
                            </div>
                            <SeverityBadge severity={alert.severity}/>
                          </div>
                          <div className="d-flex justify-content-between align-items-center mt-1">
                            <StatusBadge status={alert.status}/>
                            <small className="opacity-75">{new Date(alert.timestamp).toLocaleTimeString()}</small>
                          </div>
                        </button>
                      )) : (
                        <div className="p-4 text-center text-muted">No attacker alerts match this filter.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-xl-7">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-danger text-white"><strong>Alert Details</strong></div>
                  <div className="card-body">
                    {selectedAlert ? (
                      <>
                        <table className="table table-borderless mb-3">
                          <tbody>
                            {[
                              ['Alert ID',        selectedAlert.id],
                              ['Type',            selectedAlert.type],
                              ['Severity',        <SeverityBadge severity={selectedAlert.severity}/>],
                              ['Status',          <StatusBadge status={selectedAlert.status}/>],
                              ['Source Host',     selectedAlert.source_host],
                              ['Source IP',       selectedAlert.source_ip],
                              ['Destination',     selectedAlert.destination_host],
                              ['Dest IP',         selectedAlert.destination_ip],
                              ['Reason',          selectedAlert.reason||'—'],
                              ['Timestamp',       selectedAlert.timestamp],
                            ].map(([label,val])=>(
                              <tr key={label}><th style={{width:160,color:'#6c757d',fontWeight:500}}>{label}</th><td>{val}</td></tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="d-flex flex-wrap gap-2">
                          <button className="btn btn-danger btn-sm" onClick={()=>updateAlertStatus(selectedAlert.id,'block')}><i className="bi bi-shield-x me-1"/>Block</button>
                          <button className="btn btn-success btn-sm" onClick={()=>updateAlertStatus(selectedAlert.id,'resolve')}><i className="bi bi-check-circle me-1"/>Resolve</button>
                          <button className="btn btn-warning btn-sm" onClick={()=>updateAlertStatus(selectedAlert.id,'acknowledge')}><i className="bi bi-eye me-1"/>Acknowledge</button>
                          <button className="btn btn-outline-secondary btn-sm" onClick={()=>updateAlertStatus(selectedAlert.id,'clear')}>Clear</button>
                        </div>
                      </>
                    ) : (
                      <p className="text-muted mb-0">Select an alert to view details.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── DETAILS ── */}
          {activeSection === 'details' && (
            <div className="row g-4">
              <div className="col-12 col-lg-7">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-danger text-white"><strong>Alert Details</strong></div>
                  <div className="card-body">
                    {selectedAlert ? (
                      <table className="table table-borderless mb-0">
                        <tbody>
                          {[['Alert ID',selectedAlert.id],['Type',selectedAlert.type],['Severity',<SeverityBadge severity={selectedAlert.severity}/>],['Status',<StatusBadge status={selectedAlert.status}/>],['Source Host',selectedAlert.source_host],['Source IP',selectedAlert.source_ip],['Dest Host',selectedAlert.destination_host],['Dest IP',selectedAlert.destination_ip],['Reason',selectedAlert.reason||'—'],['Timestamp',selectedAlert.timestamp]].map(([l,v])=>(
                            <tr key={l}><th style={{width:180,color:'#6c757d',fontWeight:500}}>{l}</th><td>{v}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <p className="text-muted mb-0">Select an alert to view details.</p>}
                  </div>
                </div>
              </div>
              <div className="col-12 col-lg-5">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-dark text-white"><strong>Actions</strong></div>
                  <div className="card-body">
                    {selectedAlert ? (
                      <>
                        <p className="text-muted small">Control alert <code>{selectedAlert.id}</code></p>
                        <div className="d-flex flex-wrap gap-2 mb-3">
                          <button className="btn btn-danger" onClick={()=>updateAlertStatus(selectedAlert.id,'block')}><i className="bi bi-shield-x me-1"/>Block Attacker</button>
                          <button className="btn btn-success" onClick={()=>updateAlertStatus(selectedAlert.id,'resolve')}>Resolve</button>
                          <button className="btn btn-outline-warning" onClick={()=>updateAlertStatus(selectedAlert.id,'acknowledge')}>Acknowledge</button>
                          <button className="btn btn-outline-secondary" onClick={()=>updateAlertStatus(selectedAlert.id,'clear')}>Clear</button>
                        </div>
                        {recentPings.filter(p=>p.src_host===selectedAlert.source_host).length>0&&(
                          <div>
                            <div className="fw-semibold small mb-2">Related Ping Events</div>
                            {recentPings.filter(p=>p.src_host===selectedAlert.source_host).slice(0,4).map(p=>(
                              <div key={p.id} className="border-bottom py-1 small">
                                <div className="d-flex justify-content-between"><span>{p.src_host} → {p.dst_host}</span><PingStatusBadge status={p.status}/></div>
                                {p.output&&<div className="text-muted" style={{fontSize:11}}>{summarizePingOutput(p.output)}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : <p className="text-muted mb-0">Pick an alert before using actions.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SEVERITY ── */}
          {activeSection === 'severity' && (
            <div className="row g-4">
              <div className="col-12 col-lg-5">
                <div className="card shadow-sm"><div className="card-header bg-dark text-white"><strong>Severity Breakdown</strong></div><div className="card-body"><SeverityDonut counts={counts}/></div></div>
              </div>
              <div className="col-12 col-lg-7">
                <div className="row g-3">
                  {severityOptions.filter(s=>s!=='all').map(severity=>{
                    const colorMap={Critical:'#dc3545',High:'#fd7e14',Medium:'#0dcaf0',Low:'#6c757d'};
                    const cnt=counts.severity[severity]||0;
                    const total=alerts.length||1;
                    return (
                      <div key={severity} className="col-12 col-sm-6">
                        <div className="card shadow-sm h-100" style={{borderLeft:`4px solid ${colorMap[severity]}`}}>
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <span className="fw-semibold">{severity}</span><SeverityBadge severity={severity}/>
                            </div>
                            <div className="fs-2 fw-bold" style={{color:colorMap[severity]}}>{cnt}</div>
                            <div className="progress mt-2" style={{height:6}}><div className="progress-bar" style={{width:`${(cnt/total)*100}%`,background:colorMap[severity]}}/></div>
                            <div className="small text-muted mt-1">{Math.round((cnt/total)*100)}% of total</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── STATUS ── */}
          {activeSection === 'status' && (
            <div className="row g-4">
              <div className="col-12 col-lg-6">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-warning text-dark"><strong>Alert Status Breakdown</strong></div>
                  <div className="card-body">
                    {statusOptions.filter(s=>s!=='all').map(s=>{
                      const cnt=counts.status[s]||0, max=alerts.length||1;
                      const color={new:'#dc3545',acknowledged:'#ffc107',blocked:'#212529',resolved:'#198754'}[s]||'#6c757d';
                      return (
                        <div key={s} className="mb-3">
                          <div className="d-flex justify-content-between small mb-1"><span className="fw-semibold" style={{textTransform:'capitalize'}}>{s}</span><span>{cnt}</span></div>
                          <div className="progress" style={{height:8}}><div className="progress-bar" style={{width:`${(cnt/max)*100}%`,background:color}}/></div>
                        </div>
                      );
                    })}
                    <div className="mt-3 pt-3 border-top"><div className="d-flex justify-content-between small"><span className="text-muted">Attack Pings</span><span className="text-danger fw-bold">{attackPings.length}</span></div></div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-lg-6">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-dark text-white"><strong>Attacker Summary</strong></div>
                  <div className="card-body p-0">
                    {attackerAlerts.length ? attackerAlerts.slice(0,10).map(a=>(
                      <div key={a.id} className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                        <div>
                          <div className="fw-semibold small" style={{fontFamily:'monospace'}}>{a.source_host||a.source_ip||'—'}</div>
                          <div className="small text-muted">{a.type}</div>
                        </div>
                        <div className="d-flex gap-1 align-items-center"><SeverityBadge severity={a.severity}/><StatusBadge status={a.status}/></div>
                      </div>
                    )) : <div className="p-4 text-center text-muted">No attacker data.</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ACTIONS ── */}
          {activeSection === 'actions' && (
            <div className="row g-4">
              <div className="col-12 col-lg-6">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-dark text-white"><strong>Alert Actions</strong></div>
                  <div className="card-body">
                    {selectedAlert ? (
                      <>
                        <div className="mb-3 p-3 rounded" style={{background:'#f8fafc',border:'1px solid #e2e8f0'}}>
                          <div className="fw-semibold">{selectedAlert.type}</div>
                          <div className="small text-muted">{selectedAlert.source_host} → {selectedAlert.destination_host}</div>
                          <div className="mt-2 d-flex gap-2"><SeverityBadge severity={selectedAlert.severity}/><StatusBadge status={selectedAlert.status}/></div>
                        </div>
                        <div className="d-flex flex-wrap gap-2">
                          <button className="btn btn-danger" onClick={()=>updateAlertStatus(selectedAlert.id,'block')}><i className="bi bi-shield-x me-1"/>Block Attacker</button>
                          <button className="btn btn-success" onClick={()=>updateAlertStatus(selectedAlert.id,'resolve')}><i className="bi bi-check-circle me-1"/>Resolve</button>
                          <button className="btn btn-warning" onClick={()=>updateAlertStatus(selectedAlert.id,'acknowledge')}>Acknowledge</button>
                          <button className="btn btn-outline-secondary" onClick={()=>updateAlertStatus(selectedAlert.id,'clear')}>Clear</button>
                        </div>
                      </>
                    ) : <p className="text-muted mb-0">Select an alert from Alert List first.</p>}
                  </div>
                </div>
              </div>
              <div className="col-12 col-lg-6">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-warning text-dark"><strong>Attack Status</strong></div>
                  <div className="card-body">
                    {[{label:'Active',val:activeCount,color:'#dc3545'},{label:'Acknowledged',val:counts.status.acknowledged||0,color:'#ffc107'},{label:'Blocked',val:blockedCount,color:'#212529'},{label:'Resolved',val:resolvedCount,color:'#198754'}].map(({label,val,color})=>(
                      <div key={label} className="d-flex justify-content-between align-items-center border-bottom py-2">
                        <span className="fw-semibold" style={{color}}>{label}</span>
                        <span className="fs-5 fw-bold" style={{color}}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── FILTERS ── */}
          {activeSection === 'filters' && (
            <div className="row g-4">
              <div className="col-12 col-lg-4">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-danger text-white"><strong>Filters (Attackers Only)</strong></div>
                  <div className="card-body">
                    <div className="mb-3"><label className="form-label">Severity</label><select className="form-select" value={severityFilter} onChange={e=>setSeverityFilter(e.target.value)}>{severityOptions.map(s=><option key={s} value={s}>{s==='all'?'All severities':s}</option>)}</select></div>
                    <div className="mb-3"><label className="form-label">Status</label><select className="form-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>{statusOptions.map(s=><option key={s} value={s}>{s==='all'?'All statuses':s}</option>)}</select></div>
                    <button className="btn btn-outline-secondary btn-sm" onClick={()=>{setSeverityFilter('all');setStatusFilter('all');}}>Clear Filters</button>
                    <div className="mt-3 pt-3 border-top"><div className="small text-muted">{filteredAlerts.length} attacker alerts match</div></div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-lg-8">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-dark text-white"><strong>Filtered Attacker Alerts</strong></div>
                  <div className="card-body p-0">
                    <div className="table-responsive">
                      <table className="table table-hover mb-0">
                        <thead className="table-light"><tr><th>Alert</th><th>Severity</th><th>Status</th><th>Source</th><th>Destination</th><th>Actions</th></tr></thead>
                        <tbody>
                          {filteredAlerts.length ? filteredAlerts.map(alert=>(
                            <tr key={alert.id} style={{cursor:'pointer'}} onClick={()=>setSelectedAlertId(alert.id)}>
                              <td className="fw-semibold">{alert.type}</td>
                              <td><SeverityBadge severity={alert.severity}/></td>
                              <td><StatusBadge status={alert.status}/></td>
                              <td className="small">{alert.source_host} <span className="text-muted">({alert.source_ip})</span></td>
                              <td className="small">{alert.destination_host}</td>
                              <td><button className="btn btn-danger btn-sm py-0 px-2" style={{fontSize:11}} onClick={e=>{e.stopPropagation();updateAlertStatus(alert.id,'block');}}>Block</button></td>
                            </tr>
                          )) : <tr><td colSpan="6" className="text-center text-muted py-3">No attacker alerts for this filter</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── HISTORY ── */}
          {activeSection === 'history' && (
            <div className="row g-4">
              <div className="col-12 col-lg-7">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-dark text-white"><strong>Attack History</strong></div>
                  <div className="card-body">
                    <div className="d-flex align-items-center gap-3 mb-3">
                      <label className="form-label mb-0 small">Items shown: {historyLimit}</label>
                      <input type="range" className="form-range flex-grow-1" min="5" max="50" step="1" value={historyLimit} onChange={e=>setHistoryLimit(Number(e.target.value))}/>
                    </div>
                    <div className="list-group">
                      {historyItems.map(alert=>(
                        <button key={alert.id} type="button" className="list-group-item list-group-item-action" onClick={()=>setSelectedAlertId(alert.id)}>
                          <div className="d-flex justify-content-between"><strong>{alert.type}</strong><StatusBadge status={alert.status}/></div>
                          <div className="small text-muted">{alert.source_host} → {alert.destination_host}</div>
                          <div className="small text-muted">{alert.timestamp}</div>
                        </button>
                      ))}
                      {!historyItems.length&&<div className="p-3 text-muted text-center">No attacker history yet.</div>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-lg-5">
                <div className="card h-100 shadow-sm">
                  <div className="card-header bg-secondary text-white"><strong>IDS Rules</strong></div>
                  <div className="card-body p-0">
                    <div className="table-responsive">
                      <table className="table table-sm mb-0">
                        <thead className="table-light"><tr><th>Rule</th><th>Name</th><th>Hits</th></tr></thead>
                        <tbody>
                          {rules.map(rule=><tr key={rule.id}><td>{rule.id}</td><td>{rule.name}</td><td className={rule.hits>0?'fw-bold text-danger':''}>{rule.hits}</td></tr>)}
                          {!rules.length&&<tr><td colSpan="3" className="text-center text-muted py-2">No rules</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    <div className="p-3 border-top">
                      <div className="fw-semibold small mb-2">Recent Attack Pings</div>
                      {attackPings.slice(0,6).map(ping=>(
                        <div key={ping.id} className="border-bottom py-1">
                          <div className="d-flex justify-content-between align-items-center gap-2">
                            <div className="small fw-semibold text-danger">{ping.src_host} → {ping.dst_host}</div>
                            <PingStatusBadge status={ping.status}/>
                          </div>
                          {ping.output&&<div className="small text-muted" style={{fontSize:11}}>{summarizePingOutput(ping.output)}</div>}
                        </div>
                      ))}
                      {!attackPings.length&&<div className="text-muted small">No attack pings yet.</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes idsPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes idsBannerSlide { from{transform:translateY(-20px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>
  );
}