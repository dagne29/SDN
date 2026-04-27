const STORAGE_KEY = 'sdn_ping_history_v1';

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch (e) {
    return null;
  }
}

export function getPingKey(ping) {
  if (!ping) return null;
  return (
    ping.id ||
    ping.flow_id ||
    ping.timestamp ||
    ping.time ||
    ping.command ||
    `${ping.src_host || ping.src || ''}->${ping.dst_host || ping.dst || ''}`
  );
}

export function getPingSequence(ping) {
  const id = (ping?.id || '').toString();
  const flowId = (ping?.flow_id || '').toString();
  const match = id.match(/^PING-(\d+)$/i) || flowId.match(/^PING-(\d+)$/i) || flowId.match(/^FLOW-(\d+)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function getPingTimeMs(ping) {
  const raw = ping?.timestamp || ping?.time || ping?.created_at || '';
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

export function formatPingTimelineTime(ping) {
  const timeMs = getPingTimeMs(ping);
  if (!timeMs) return '--:--';

  const date = new Date(timeMs);
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function normalizePingEntry(ping) {
  if (!ping) return null;

  const srcHost = ping.src_host || ping.src;
  const dstHost = ping.dst_host || ping.dst;
  const timestamp = ping.timestamp || ping.time || ping.created_at || new Date().toISOString();
  const id = ping.id || ping.flow_id || getPingKey(ping) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const command = ping.command || (srcHost && dstHost ? `ping ${srcHost} ${dstHost}` : undefined);

  return {
    ...ping,
    id,
    flow_id: ping.flow_id,
    src_host: srcHost,
    dst_host: dstHost,
    src_ip: ping.src_ip,
    dst_ip: ping.dst_ip,
    protocol: ping.protocol || 'ICMP',
    activity_type: ping.activity_type || ((command || '').toLowerCase().includes('ping') ? 'ping' : ping.activity_type),
    command,
    status: ping.status || 'complete',
    timestamp,
    output: ping.output,
  };
}

export function readPingHistory() {
  try {
    const storage = getStorage();
    const raw = storage ? storage.getItem(STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function writePingHistory(history) {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(history || []));
  } catch (e) {
    // ignore storage errors (private mode, quota, etc.)
  }
}

export function mergePingHistory(existing, incoming, { max = 200 } = {}) {
  const current = Array.isArray(existing) ? existing : [];
  const nextItems = (Array.isArray(incoming) ? incoming : [incoming])
    .map(normalizePingEntry)
    .filter(Boolean);

  if (!nextItems.length) return current.slice(0, max);

  const byId = new Map();
  // Prefer newer items first so they win on overwrite.
  [...nextItems, ...current].forEach((item) => {
    if (!item) return;
    const id = item.id || item.flow_id || getPingKey(item);
    if (!id) return;
    byId.set(id, item);
  });

  const merged = Array.from(byId.values()).sort((a, b) => {
    const ta = getPingTimeMs(a);
    const tb = getPingTimeMs(b);
    return tb - ta;
  });

  return merged.slice(0, max);
}

export function appendPingHistory(incoming, { max = 200 } = {}) {
  const existing = readPingHistory();
  const next = mergePingHistory(existing, incoming, { max });
  writePingHistory(next);
  return next;
}

export function clearPingHistory() {
  writePingHistory([]);
  return [];
}
