from collections import Counter
from datetime import datetime, timedelta
import random
import threading
import time

from flask import Flask, jsonify, request
from flask_cors import CORS


app = Flask(__name__)
CORS(app)


def now_iso():
    return datetime.now().isoformat()


class NetworkState:
    def __init__(self):
        self.switches = {
            "s1": {"name": "Core Switch", "ip": "10.255.0.1", "ports": 6, "status": "online"},
            "s2": {"name": "User Access 1", "ip": "10.0.1.254", "ports": 3, "status": "online"},
            "s3": {"name": "User Access 2", "ip": "10.0.1.253", "ports": 3, "status": "online"},
            "s4": {"name": "User Access 3", "ip": "10.0.1.252", "ports": 3, "status": "online"},
            "s5": {"name": "Server Switch", "ip": "10.0.2.254", "ports": 3, "status": "online"},
            "s6": {"name": "DMZ Switch", "ip": "172.16.0.254", "ports": 2, "status": "online"},
            "s7": {"name": "Edge Switch", "ip": "192.168.100.254", "ports": 6, "status": "online"},
        }
        self.routers = {
            "r1": {
                "name": "Linux Router",
                "ip": "10.0.1.1/24",
                "interfaces": {
                    "r1-eth0": "10.0.1.1/24",
                    "r1-eth1": "10.0.2.1/24",
                    "r1-eth2": "172.16.0.1/24",
                    "r1-eth3": "192.168.100.1/24",
                },
            }
        }
        self.hosts = {
            "user1": {"name": "User 1", "ip": "10.0.1.10", "mac": "00:00:00:00:00:01", "role": "user", "connected_to": "s2"},
            "user2": {"name": "User 2", "ip": "10.0.1.11", "mac": "00:00:00:00:00:02", "role": "user", "connected_to": "s2"},
            "user3": {"name": "User 3", "ip": "10.0.1.12", "mac": "00:00:00:00:00:03", "role": "user", "connected_to": "s3"},
            "user4": {"name": "User 4", "ip": "10.0.1.13", "mac": "00:00:00:00:00:04", "role": "user", "connected_to": "s3"},
            "user5": {"name": "User 5", "ip": "10.0.1.14", "mac": "00:00:00:00:00:05", "role": "user", "connected_to": "s4"},
            "user6": {"name": "User 6", "ip": "10.0.1.15", "mac": "00:00:00:00:00:06", "role": "user", "connected_to": "s4"},
            "mail_srv": {"name": "Mail Server", "ip": "10.0.2.10", "mac": "00:00:00:00:00:10", "role": "server", "connected_to": "s5"},
            "file_srv": {"name": "File Server", "ip": "10.0.2.20", "mac": "00:00:00:00:00:11", "role": "server", "connected_to": "s5"},
            "web_srv": {"name": "Web Server", "ip": "172.16.0.10", "mac": "00:00:00:00:00:12", "role": "server", "connected_to": "s6"},
            "attacker": {"name": "External Attacker", "ip": "192.168.100.10", "mac": "00:00:00:00:10:01", "role": "attacker", "connected_to": "s7"},
            "pub_user": {"name": "Public User", "ip": "192.168.100.20", "mac": "00:00:00:00:10:02", "role": "user", "connected_to": "s7"},
            "ddos_att": {"name": "DDoS Attacker", "ip": "192.168.100.30", "mac": "00:00:00:00:10:03", "role": "attacker", "connected_to": "s7"},
            "arp_att": {"name": "ARP Spoofer", "ip": "192.168.100.40", "mac": "00:00:00:00:10:04", "role": "attacker", "connected_to": "s7"},
            "scan_att": {"name": "Scanner", "ip": "192.168.100.50", "mac": "00:00:00:00:10:05", "role": "attacker", "connected_to": "s7"},
        }
        self.links = [
            {"src": "s1", "dst": "s2"},
            {"src": "s1", "dst": "s3"},
            {"src": "s1", "dst": "s4"},
            {"src": "s1", "dst": "s5"},
            {"src": "s1", "dst": "s6"},
            {"src": "s1", "dst": "s7"},
            {"src": "r1", "dst": "s2"},
            {"src": "r1", "dst": "s5"},
            {"src": "r1", "dst": "s6"},
            {"src": "r1", "dst": "s7"},
            {"src": "user1", "dst": "s2"},
            {"src": "user2", "dst": "s2"},
            {"src": "user3", "dst": "s3"},
            {"src": "user4", "dst": "s3"},
            {"src": "user5", "dst": "s4"},
            {"src": "user6", "dst": "s4"},
            {"src": "mail_srv", "dst": "s5"},
            {"src": "file_srv", "dst": "s5"},
            {"src": "web_srv", "dst": "s6"},
            {"src": "attacker", "dst": "s7"},
            {"src": "pub_user", "dst": "s7"},
            {"src": "ddos_att", "dst": "s7"},
            {"src": "arp_att", "dst": "s7"},
            {"src": "scan_att", "dst": "s7"},
        ]
        self.flows = []
        self.alerts = []
        self.ping_events = []
        self.blocked_ips = []
        self.ids_rules = [
            {"id": "R1", "name": "Detect ICMP flood patterns", "status": "Enabled", "hits": 0},
            {"id": "R2", "name": "Detect SYN flood patterns", "status": "Enabled", "hits": 0},
            {"id": "R3", "name": "Detect traffic from attacker hosts", "status": "Enabled", "hits": 0},
            {"id": "R4", "name": "Detect unusual bandwidth spikes", "status": "Enabled", "hits": 0},
        ]
        self.request_log = []
        self.http_requests = []
        self.flow_counter = 0
        self.alert_counter = 0
        self.ping_counter = 0
        self.lock = threading.Lock()

    def guess_role(self, host_name):
        name = (host_name or "").lower()
        if any(token in name for token in ("atk", "attacker", "scan", "scan_att", "att", "mal", "evil")):
            return "attacker"
        if any(token in name for token in ("srv", "server", "svc", "db")):
            return "server"
        return "user"

    def ensure_host(self, host_name, ip=None, mac=None, role=None):
        if not host_name:
            return
        if host_name not in self.hosts:
            self.hosts[host_name] = {
                "name": host_name,
                "ip": ip or "",
                "mac": mac or "00:00:00:00:00:00",
                "role": role or self.guess_role(host_name),
            }
            return
        host = self.hosts[host_name]
        if ip:
            host["ip"] = ip
        if mac:
            host["mac"] = mac
        if role:
            host["role"] = role

    def host_names(self):
        return list(self.hosts.keys())

    def source_for(self, host_name):
        host = self.hosts.get(host_name, {})
        if not host:
            return {
                "host": host_name,
                "name": host_name,
                "ip": "",
                "mac": "00:00:00:00:00:00",
                "role": self.guess_role(host_name),
            }
        return {
            "host": host_name,
            "name": host.get("name", host_name),
            "ip": host.get("ip", "0.0.0.0"),
            "mac": host.get("mac", "00:00:00:00:00:00"),
            "role": host.get("role", "unknown"),
        }


net = NetworkState()


@app.before_request
def record_http_request():
    try:
        entry = {
            "ts": now_iso(),
            "method": request.method,
            "path": request.path,
            "remote_addr": request.remote_addr,
            "content_type": request.content_type,
        }
        with net.lock:
            net.http_requests.append(entry)
            net.http_requests = net.http_requests[-200:]
    except Exception:
        pass


def increment_rule_hit(rule_id):
    for rule in net.ids_rules:
        if rule["id"] == rule_id:
            rule["hits"] += 1
            return


def create_alert(source, destination, alert_type, severity, reason, context=None):
    net.alert_counter += 1
    timestamp = now_iso()
    alert = {
        "id": f"ALT-{net.alert_counter:03d}",
        "timestamp": timestamp,
        "type": alert_type,
        "source_ip": source["ip"],
        "destination_ip": destination["ip"],
        "source_host": source["host"],
        "destination_host": destination["host"],
        "severity": severity,
        "status": "new",
        "reason": reason,
    }
    if context:
        if context.get("flow_id"):
            alert["flow_id"] = context.get("flow_id")
        if context.get("protocol"):
            alert["protocol"] = context.get("protocol")
        if context.get("command"):
            alert["command"] = context.get("command")
    net.alerts.append(alert)
    if source.get("ip") and source["ip"] not in net.blocked_ips:
        net.blocked_ips.append(source["ip"])
    return alert


def record_ping_event(flow, alerts, source_host, destination_host, origin="mininet"):
    with net.lock:
        net.ping_counter += 1
        output = flow.get("output") or (
            f"64 bytes from {flow.get('dst_ip', '')}: icmp_seq=1 ttl=64 "
            f"time={flow.get('latency_ms', 0)} ms"
        )
        latency_ms = flow.get("latency_ms", 0) or 0
        ping_event = {
            "id": f"PING-{net.ping_counter:04d}",
            "flow_id": flow["id"],
            "src_host": flow["src_host"],
            "src_ip": flow["src_ip"],
            "src_mac": flow["src_mac"],
            "dst_host": flow["dst_host"],
            "dst_ip": flow["dst_ip"],
            "dst_mac": flow["dst_mac"],
            "protocol": flow["protocol"],
            "bytes": flow["bytes"],
            "packets": flow["packets"],
            "packets_transmitted": flow.get("packets_transmitted") or flow["packets"],
            "packets_received": flow.get("packets_received") or flow["packets"],
            "packet_loss_pct": flow.get("packet_loss_pct"),
            "packet_loss": flow.get("packet_loss"),
            "latency_ms": flow["latency_ms"],
            "round_trip_time": flow.get("round_trip_time") or f"{latency_ms} ms",
            "bandwidth_mbps": flow.get("bandwidth_mbps"),
            "status": flow["status"],
            "timestamp": flow["timestamp"],
            "command": flow["command"],
            "output": output,
            "activity_type": "ping",
            "origin": origin,
            "attack_detected": any(
                (alert.get("severity") or "").lower() in ("critical", "high") or "attack" in (alert.get("type") or "").lower()
                for alert in alerts
            ),
            "generated_alerts": alerts,
            "src": source_host,
            "dst": destination_host,
        }
        net.ping_events.append(ping_event)
        net.ping_events = net.ping_events[-200:]
        return ping_event


def ingest_ping_event(payload):
    # Backwards-compatible: accept terminal ping payload and convert it into a real flow + IDS alerts.
    src = payload.get("src_host") or payload.get("src") or ""
    dst = payload.get("dst_host") or payload.get("dst") or ""

    if not src or not dst:
        with net.lock:
            net.ping_counter += 1
            latency_ms = payload.get("latency_ms") or 0
            ping_event = {
                "id": payload.get("id") or f"PING-{net.ping_counter:04d}",
                "flow_id": payload.get("flow_id") or payload.get("id") or f"FLOW-{net.flow_counter:04d}",
                "src_host": src,
                "src_ip": payload.get("src_ip") or "",
                "src_mac": payload.get("src_mac") or "",
                "dst_host": dst,
                "dst_ip": payload.get("dst_ip") or "",
                "dst_mac": payload.get("dst_mac") or "",
                "protocol": payload.get("protocol") or "ICMP",
                "bytes": payload.get("bytes") or 64,
                "packets": payload.get("packets") or 1,
                "packets_transmitted": payload.get("packets_transmitted") or payload.get("packets") or 1,
                "packets_received": payload.get("packets_received") or payload.get("packets") or 1,
                "packet_loss_pct": payload.get("packet_loss_pct"),
                "packet_loss": payload.get("packet_loss"),
                "latency_ms": payload.get("latency_ms") or 0,
                "round_trip_time": payload.get("round_trip_time") or (f"{latency_ms} ms" if latency_ms is not None else None),
                "bandwidth_mbps": payload.get("bandwidth_mbps"),
                "status": payload.get("status") or "success",
                "timestamp": payload.get("timestamp") or now_iso(),
                "command": payload.get("command") or "ping",
                "output": payload.get("output") or (
                    f"64 bytes from {payload.get('dst_ip', '')}: icmp_seq=1 ttl=64 "
                    f"time={payload.get('latency_ms', 0)} ms"
                ),
                "activity_type": "ping",
                "origin": payload.get("origin") or "terminal",
                "attack_detected": bool(payload.get("attack_detected")),
                "generated_alerts": payload.get("generated_alerts") or [],
                "src": payload.get("src") or payload.get("src_host") or "",
                "dst": payload.get("dst") or payload.get("dst_host") or "",
            }
            net.ping_events.append(ping_event)
            net.ping_events = net.ping_events[-200:]
            return ping_event

    with net.lock:
        net.ensure_host(src, ip=payload.get("src_ip"), mac=payload.get("src_mac"), role=payload.get("src_role"))
        net.ensure_host(dst, ip=payload.get("dst_ip"), mac=payload.get("dst_mac"), role=payload.get("dst_role"))

    latency = float(payload.get("latency_ms") or 0)
    packets = int(payload.get("packets") or payload.get("packets_transmitted") or 1)
    bytes_count = int(payload.get("bytes") or 64)
    command = payload.get("command") or f"ping -c 1 {dst}"
    origin = payload.get("origin") or "terminal"

    flow, alerts = register_request(src, dst, "ICMP", bytes_count, packets, latency, 0.0, command=command, activity_type="ping")
    if payload.get("output"):
        flow["output"] = payload["output"]
    if payload.get("packets_transmitted") is not None:
        flow["packets_transmitted"] = payload.get("packets_transmitted")
    if payload.get("packets_received") is not None:
        flow["packets_received"] = payload.get("packets_received")
    if payload.get("packet_loss_pct") is not None:
        flow["packet_loss_pct"] = payload.get("packet_loss_pct")
    if payload.get("packet_loss") is not None:
        flow["packet_loss"] = payload.get("packet_loss")
    ping_event = record_ping_event(flow, alerts, src, dst, origin=origin)
    if payload.get("output"):
        ping_event["output"] = payload.get("output")
    if payload.get("status"):
        ping_event["status"] = payload.get("status")
    if payload.get("round_trip_time"):
        ping_event["round_trip_time"] = payload.get("round_trip_time")
    if payload.get("timestamp"):
        ping_event["timestamp"] = payload.get("timestamp")
    return ping_event


def flow_status(source, destination):
    if source["role"] == "attacker" or destination["role"] == "attacker":
        return "suspicious"
    return "active"


def register_request(
    source_host,
    destination_host,
    protocol,
    bytes_count,
    packets,
    latency_ms,
    bandwidth_mbps=None,
    command=None,
    activity_type=None,
):
    with net.lock:
        source = net.source_for(source_host)
        destination = net.source_for(destination_host)
        net.flow_counter += 1
        timestamp = now_iso()

        flow = {
            "id": f"FLOW-{net.flow_counter:04d}",
            "src_host": source["host"],
            "src_ip": source["ip"],
            "src_mac": source["mac"],
            "dst_host": destination["host"],
            "dst_ip": destination["ip"],
            "dst_mac": destination["mac"],
            "protocol": protocol,
            "bytes": bytes_count,
            "packets": packets,
            "latency_ms": round(latency_ms, 3),
            "bandwidth_mbps": bandwidth_mbps,
            "status": flow_status(source, destination),
            "timestamp": timestamp,
            "command": command or (f"ping {source_host} {destination_host}" if protocol == "ICMP" else f"iperf {source_host} {destination_host}"),
            "activity_type": activity_type or ("ping" if protocol == "ICMP" else "traffic"),
        }
        net.flows.append(flow)
        net.flows = net.flows[-150:]

        request_entry = {
            "source": source["host"],
            "destination": destination["host"],
            "protocol": protocol,
            "timestamp": datetime.now(),
        }
        net.request_log.append(request_entry)
        net.request_log = net.request_log[-200:]

        recent_window = datetime.now() - timedelta(seconds=20)
        recent_same_requests = [
            entry for entry in net.request_log
            if entry["source"] == source["host"]
            and entry["destination"] == destination["host"]
            and entry["protocol"] == protocol
            and entry["timestamp"] >= recent_window
        ]

        generated_alerts = []
        context = {"flow_id": flow["id"], "protocol": protocol, "command": flow.get("command")}
        if source["role"] == "attacker":
            generated_alerts.append(
                create_alert(source, destination, f"{protocol} attacker traffic", "Critical", "Traffic originated from attacker host", context=context)
            )
            increment_rule_hit("R3")

        if protocol == "ICMP" and len(recent_same_requests) >= 3:
            generated_alerts.append(
                create_alert(source, destination, "ICMP flood suspected", "High", "Repeated ping requests detected in a short interval", context=context)
            )
            increment_rule_hit("R1")

        if protocol == "TCP" and bytes_count >= 80000:
            generated_alerts.append(
                create_alert(source, destination, "Bandwidth spike detected", "Medium", "Large TCP transfer observed in Mininet", context=context)
            )
            increment_rule_hit("R4")

        if source["host"] == "atk_syn":
            generated_alerts.append(
                create_alert(source, destination, "SYN flood suspected", "Critical", "SYN attacker host generated a request", context=context)
            )
            increment_rule_hit("R2")

        return flow, generated_alerts


def protocol_summary(flows):
    counts = Counter(flow["protocol"] for flow in flows)
    return [{"protocol": protocol, "count": count} for protocol, count in counts.items()]


def traffic_stats():
    total_bytes = sum(flow["bytes"] for flow in net.flows)
    total_packets = sum(flow["packets"] for flow in net.flows)
    total_flows = len(net.flows)
    active_flows = len([flow for flow in net.flows if flow["status"] == "active"])
    suspicious_flows = len([flow for flow in net.flows if flow["status"] == "suspicious"])
    bandwidth_in = round(sum((flow.get("bandwidth_mbps") or 0) for flow in net.flows[-10:]), 2)
    return {
        "total_bytes": total_bytes,
        "total_packets": total_packets,
        "total_flows": total_flows,
        "active_flows": active_flows,
        "suspicious_flows": suspicious_flows,
        "bandwidth_in": f"{bandwidth_in:.2f} Mbps",
        "avg_latency_ms": round(sum(flow["latency_ms"] for flow in net.flows) / total_flows, 3) if total_flows else 0,
    }


def ping_flows():
    return list(net.ping_events)


def ping_stats():
    pings = ping_flows()
    total = len(pings)
    successful = len([ping for ping in pings if (ping.get("status") or "").lower() == "success"])
    suspicious = len([ping for ping in pings if ping.get("attack_detected") or (ping.get("status") or "").lower() == "suspicious"])
    return {
        "total_pings": total,
        "successful_pings": successful,
        "suspicious_pings": suspicious,
        "latest_ping": pings[-1] if pings else None,
        "recent_pings": pings[-10:],
    }


def topology_payload():
    return {
        "switches": net.switches,
        "routers": net.routers,
        "hosts": net.hosts,
        "links": net.links,
    }


def background_traffic():
    normal_pairs = [
        ("user1", "mail_srv"),
        ("user2", "file_srv"),
        ("user3", "user4"),
        ("pub_user", "web_srv"),
    ]
    while True:
        src, dst = random.choice(normal_pairs)
        protocol = random.choice(["TCP", "UDP"])
        bytes_count = random.randint(1200, 90000)
        packets = random.randint(5, 120)
        latency = random.uniform(0.2, 5.0)
        bandwidth = round(random.uniform(1.5, 18.0), 2)
        register_request(src, dst, protocol, bytes_count, packets, latency, bandwidth, activity_type="background")
        time.sleep(5)


threading.Thread(target=background_traffic, daemon=True).start()


@app.route("/api/dashboard")
def dashboard():
    stats = traffic_stats()
    ping_data = ping_stats()
    return jsonify({
        "network_status": {
            "controller": "running",
            "topology": "active",
            "hosts": len(net.hosts),
            "switches": len(net.switches),
            "alerts": len(net.alerts),
            "blocked_ips": len(net.blocked_ips),
        },
        "network_load": {
            "total_flows": stats["total_flows"],
            "total_bytes": stats["total_bytes"],
            "average_bytes": int(stats["total_bytes"] / stats["total_flows"]) if stats["total_flows"] else 0,
            "estimated_mbps": stats["bandwidth_in"].replace(" Mbps", ""),
            "packet_loss": "0.0%",
            "latency": f"{stats['avg_latency_ms']} ms",
        },
        "edge_status": {
            "active_devices": len(net.hosts),
            "status": "stable" if len(net.alerts) < 5 else "warning",
            "high_load": stats["suspicious_flows"] > 0,
        },
        "recent_traffic": net.flows[-10:],
        "recent_ping_traffic": ping_data["recent_pings"],
        "last_ping_flow": ping_data["latest_ping"],
        "last_ping_result": ping_data["latest_ping"],
        "active_alerts": net.alerts[-5:],
        "system_health": "good" if len(net.alerts) < 3 else "attention",
        "timestamp": now_iso(),
    })


@app.route("/api/mininet/status")
def mininet_status():
    observed_hosts = set()
    for ping in net.ping_events[-200:]:
        src = ping.get("src_host") or ping.get("src")
        dst = ping.get("dst_host") or ping.get("dst")
        if src:
            observed_hosts.add(src)
        if dst:
            observed_hosts.add(dst)
    hosts = sorted(set(net.host_names()) | observed_hosts)
    return jsonify({
        "topology_running": True,
        "controller_connected": True,
        "hosts": hosts,
        "switches": list(net.switches.keys()),
        "links": net.links,
        "timestamp": now_iso(),
    })


@app.route("/api/mininet/connectivity")
def mininet_connectivity():
    hosts = net.host_names()
    connections = []
    for idx, src in enumerate(hosts[:3]):
        dst = hosts[(idx + 1) % 3]
        connections.append({
            "src": src,
            "dst": dst,
            "status": "connected",
            "latency": f"{round(random.uniform(0.4, 2.2), 2)} ms",
        })
    return jsonify({"status": "success", "connections": connections, "timestamp": now_iso()})


@app.route("/api/mininet/ping/<src>/<dst>")
def mininet_ping(src, dst):
    latency = random.uniform(0.2, 4.5)
    flow, alerts = register_request(src, dst, "ICMP", 64, 1, latency, 0.08, command=f"ping -c4 {src} {dst}", activity_type="ping")
    flow["output"] = f"64 bytes from {flow['dst_ip']}: icmp_seq=1 ttl=64 time={flow['latency_ms']} ms"
    record_ping_event(flow, alerts, src, dst, origin="mininet")
    return jsonify({
        "command": f"ping {src} {dst}",
        "status": "success",
        "protocol": "ICMP",
        "packet_size": 64,
        "src_host": src,
        "dst_host": dst,
        "src_ip": flow["src_ip"],
        "dst_ip": flow["dst_ip"],
        "src_mac": flow["src_mac"],
        "dst_mac": flow["dst_mac"],
        "is_attacker": (net.hosts.get(src, {}).get("role") == "attacker") or (net.hosts.get(dst, {}).get("role") == "attacker"),
        "time_sent": flow["timestamp"],
        "round_trip_time": f"{flow['latency_ms']} ms",
        "output": f"64 bytes from {flow['dst_ip']}: icmp_seq=1 ttl=64 time={flow['latency_ms']} ms",
        "generated_alerts": alerts,
        "flow_id": flow["id"],
        "timestamp": flow["timestamp"],
    })


@app.route("/api/mininet/traffic/<src>/<dst>")
def mininet_traffic(src, dst):
    bandwidth = round(random.uniform(8.0, 75.0), 2)
    bytes_count = int(bandwidth * 125000)
    packets = random.randint(50, 400)
    latency = random.uniform(0.4, 8.0)
    flow, alerts = register_request(src, dst, "TCP", bytes_count, packets, latency, bandwidth, command=f"iperf {src} {dst}", activity_type="traffic")
    return jsonify({
        "command": f"iperf {src} {dst}",
        "status": "success",
        "src_host": src,
        "dst_host": dst,
        "src_ip": flow["src_ip"],
        "dst_ip": flow["dst_ip"],
        "bandwidth": f"{bandwidth} Mbits/sec",
        "jitter": f"{round(random.uniform(0.01, 0.5), 3)} ms",
        "packet_loss": f"{round(random.uniform(0.0, 1.2), 2)}%",
        "generated_alerts": alerts,
        "flow_id": flow["id"],
        "timestamp": flow["timestamp"],
    })


@app.route("/api/controller/status")
def controller_status():
    return jsonify({
        "controller_connected": True,
        "topology_running": True,
        "hosts": net.host_names(),
        "switches": list(net.switches.keys()),
        "links": net.links,
        "flow_count": len(net.flows),
        "alert_count": len(net.alerts),
        "timestamp": now_iso(),
    })


@app.route("/api/controller/switches")
def controller_switches():
    return jsonify([
        {"id": switch_id, **switch_data}
        for switch_id, switch_data in net.switches.items()
    ])


@app.route("/api/controller/flows")
def controller_flows():
    return jsonify(net.flows[-50:])


@app.route("/api/controller/statistics")
def controller_statistics():
    stats = traffic_stats()
    return jsonify({
        "connected_switches": len(net.switches),
        "managed_hosts": len(net.hosts),
        "installed_flows": stats["total_flows"],
        "active_alerts": len([alert for alert in net.alerts if alert["status"] != "resolved"]),
    })


@app.route("/api/topology/devices")
@app.route("/api/topology/graph")
def topology_devices():
    return jsonify(topology_payload())


@app.route("/api/topology/statistics")
def topology_statistics():
    return jsonify({
        "switch_count": len(net.switches),
        "host_count": len(net.hosts),
        "link_count": len(net.links),
        "attacker_hosts": len([host for host in net.hosts.values() if host["role"] == "attacker"]),
    })


@app.route("/api/topology/switches")
def topology_switches():
    return jsonify(net.switches)


@app.route("/api/topology/hosts")
def topology_hosts():
    return jsonify(net.hosts)


@app.route("/api/topology/links")
def topology_links():
    return jsonify(net.links)


@app.route('/api/controller/report', methods=['POST'])
def controller_report():
    try:
        data = request.get_json(force=True) or {}

        print("Incoming data:", data)  # 🔥 DEBUG

        flows = data.get('flows')
        
        # ✅ HANDLE SIMPLE FORMAT (fallback)
        if not flows:
            if 'src' in data and 'dst' in data:
                flows = [{
                    "src_ip": data.get("src"),
                    "dst_ip": data.get("dst"),
                    "protocol": data.get("proto", "ICMP"),
                    "activity_type": "ping"
                }]
            else:
                flows = []

        switches = data.get('switches', {})
        port_stats = data.get('port_stats', {})
        attackers = data.get('attackers', [])

        with net.lock:
            for flow in flows:
                net.flow_counter += 1

                is_ping = (
                    (flow.get("activity_type") or "").lower() == "ping"
                    or (flow.get("protocol") or "").upper() == "ICMP"
                    or "ping" in (flow.get("command") or "").lower()
                )

                flow_entry = {
                    'id': flow.get('id', f'FLOW-{net.flow_counter:04d}'),
                    'src_host': flow.get('src_host'),
                    'src_ip': flow.get('src_ip'),
                    'dst_host': flow.get('dst_host'),
                    'dst_ip': flow.get('dst_ip'),
                    'protocol': flow.get('protocol', 'ICMP'),
                    'bytes': flow.get('bytes', 64),
                    'packets': flow.get('packets', 1),
                    'latency_ms': flow.get('latency_ms', 0.0),
                    'bandwidth_mbps': flow.get('bandwidth_mbps'),
                    'status': 'active',  # 🔥 avoid crash from flow_status
                    'timestamp': now_iso(),
                    'command': flow.get('command'),
                    'activity_type': flow.get('activity_type', 'ping' if is_ping else 'controller'),
                }

                net.flows.append(flow_entry)

                if is_ping:
                    record_ping_event(
                        flow_entry,
                        flow.get("generated_alerts", []),
                        flow_entry.get("src_host"),
                        flow_entry.get("dst_host"),
                        origin="controller",
                    )

            net.flows = net.flows[-200:]

        return jsonify({'status': 'ok', 'received': len(flows)}), 200

    except Exception as e:
        print("🔥 ERROR:", str(e))
        return jsonify({'error': str(e)}), 500

@app.route("/api/topology/nodes")
def topology_nodes():
    nodes = [
        {"id": switch_id, "type": "switch", **data}
        for switch_id, data in net.switches.items()
    ] + [
        {"id": host_id, "type": "host", **data}
        for host_id, data in net.hosts.items()
    ]
    return jsonify(nodes)


@app.route("/api/traffic/flows")
def traffic_flows():
    return jsonify(list(reversed(ping_flows()[-50:])))


@app.route("/api/traffic/stats")
@app.route("/api/traffic/summary")
def traffic_summary():
    stats = traffic_stats()
    pstats = ping_stats()
    return jsonify({
        **stats,
        **pstats,
    })


@app.route("/api/traffic/protocols")
def traffic_protocols():
    return jsonify(protocol_summary(ping_flows()[-50:]))


@app.route("/api/traffic/top-flows")
def traffic_top_flows():
    limit = int(request.args.get("limit", 10))
    top_flows = sorted(ping_flows(), key=lambda flow: flow["bytes"], reverse=True)[:limit]
    return jsonify(top_flows)


@app.route("/api/traffic/bandwidth-trends")
def traffic_bandwidth_trends():
    recent = ping_flows()[-12:]
    return jsonify([
        {"timestamp": flow["timestamp"], "bandwidth_mbps": flow.get("bandwidth_mbps") or 0}
        for flow in recent
    ])


@app.route("/api/pings", methods=["GET", "DELETE"])
def pings():
    if request.method == "DELETE":
        include_flows = (request.args.get("include_flows") or "true").lower() in ("1", "true", "yes")
        with net.lock:
            flow_ids = [p.get("flow_id") for p in net.ping_events if p.get("flow_id")]
            cleared_pings = len(net.ping_events)
            net.ping_events = []
            if include_flows and flow_ids:
                flow_id_set = set(flow_ids)
                net.flows = [flow for flow in net.flows if flow.get("id") not in flow_id_set]
        return jsonify({"status": "cleared", "cleared_pings": cleared_pings, "cleared_flows": len(set(flow_ids))})

    limit = int(request.args.get("limit", 50))
    src = request.args.get("src")
    dst = request.args.get("dst")
    status = request.args.get("status")
    attack_only = request.args.get("attack_only")
    pings_list = list(reversed(ping_flows()))
    if src:
        pings_list = [ping for ping in pings_list if ping.get("src_host") == src or ping.get("src") == src]
    if dst:
        pings_list = [ping for ping in pings_list if ping.get("dst_host") == dst or ping.get("dst") == dst]
    if status:
        pings_list = [ping for ping in pings_list if (ping.get("status") or "").lower() == status.lower()]
    if attack_only and attack_only.lower() in ("1", "true", "yes"):
        pings_list = [ping for ping in pings_list if ping.get("attack_detected")]
    return jsonify(pings_list[:limit])


@app.route("/api/pings/ingest", methods=["POST"])
def ingest_ping():
    payload = request.get_json() or {}
    try:
        print(f"[ingest] /api/pings/ingest keys={sorted(list(payload.keys()))}")
    except Exception:
        pass
    ping_event = ingest_ping_event(payload)
    return jsonify(ping_event), 201


@app.route("/api/ping", methods=["POST"])
def ingest_ping_legacy():
    """
    Legacy convenience endpoint.
    Accepts the same payload as /api/pings/ingest and forwards it.
    """
    payload = request.get_json() or {}
    payload.setdefault("origin", "legacy:/api/ping")
    try:
        print(f"[ingest] /api/ping keys={sorted(list(payload.keys()))}")
    except Exception:
        pass
    ping_event = ingest_ping_event(payload)
    return jsonify(ping_event), 201


@app.route("/api/debug/http")
def debug_http_requests():
    limit = int(request.args.get("limit", 50))
    with net.lock:
        return jsonify(list(reversed(net.http_requests))[:limit])


@app.route("/api/pings/latest")
def latest_ping():
    return jsonify(ping_stats()["latest_ping"])


@app.route("/api/pings/stats")
def ping_statistics():
    return jsonify(ping_stats())


@app.route("/api/traffic/port-stats")
def traffic_port_stats():
    stats = []
    for switch_id, switch_data in net.switches.items():
        stats.append({
            "switch": switch_id,
            "name": switch_data.get("name", switch_id),
            "ports": switch_data.get("ports", 0),
            "utilization": random.randint(15, 80),
        })
    return jsonify(stats)


@app.route("/api/ids/alerts", methods=["GET", "DELETE"])
def ids_alerts():
    if request.method == "DELETE":
        with net.lock:
            cleared = len(net.alerts)
            net.alerts = []
        return jsonify({"status": "cleared", "cleared_alerts": cleared})

    limit = int(request.args.get("limit", 50))
    severity = request.args.get("severity")
    alerts = list(reversed(net.alerts))
    if severity:
        alerts = [alert for alert in alerts if alert["severity"].lower() == severity.lower()]
    return jsonify(alerts[:limit])


@app.route("/api/ids/statistics")
def ids_statistics():
    severity_counter = Counter(alert["severity"] for alert in net.alerts)
    total_alerts = len(net.alerts)
    resolved_alerts = len([alert for alert in net.alerts if alert["status"] == "resolved"])
    detection_rate = 100 if total_alerts == 0 else round(((total_alerts - resolved_alerts) / total_alerts) * 100, 1)
    return jsonify({
        "total_alerts": total_alerts,
        "critical_alerts": severity_counter.get("Critical", 0),
        "high_alerts": severity_counter.get("High", 0),
        "medium_alerts": severity_counter.get("Medium", 0),
        "low_alerts": severity_counter.get("Low", 0),
        "blocked_sources": len(net.blocked_ips),
        "detection_rate": f"{detection_rate}%",
    })


@app.route("/api/ids/rules")
def ids_rules():
    return jsonify(net.ids_rules)


@app.route("/api/ids/alerts/<alert_id>/acknowledge", methods=["PUT"])
def acknowledge_alert(alert_id):
    for alert in net.alerts:
        if alert["id"] == alert_id:
            alert["status"] = "acknowledged"
            return jsonify(alert)
    return jsonify({"error": "Alert not found"}), 404


@app.route("/api/ids/alerts/<alert_id>/resolve", methods=["PUT"])
def resolve_alert(alert_id):
    for alert in net.alerts:
        if alert["id"] == alert_id:
            alert["status"] = "resolved"
            return jsonify(alert)
    return jsonify({"error": "Alert not found"}), 404


@app.route("/api/ids/alerts/<alert_id>/block", methods=["PUT"])
def block_alert(alert_id):
    for alert in net.alerts:
        if alert["id"] == alert_id:
            alert["status"] = "blocked"
            src_ip = alert.get("source_ip")
            if src_ip and src_ip not in net.blocked_ips:
                net.blocked_ips.append(src_ip)
            return jsonify(alert)
    return jsonify({"error": "Alert not found"}), 404


@app.route("/api/ids/alerts/<alert_id>/clear", methods=["PUT"])
def clear_alert(alert_id):
    for alert in net.alerts:
        if alert["id"] == alert_id:
            alert["status"] = "cleared"
            return jsonify(alert)
    return jsonify({"error": "Alert not found"}), 404


@app.route("/api/health")
def health():
    return jsonify({"status": "healthy", "timestamp": now_iso()})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
