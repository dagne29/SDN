#!/usr/bin/env python3

"""
SDN Enterprise + Advanced Attack Simulation Topology
Clean + FIXED VERSION (no duplicates)
"""

from mininet.net import Mininet
from mininet.node import RemoteController, OVSSwitch, Node
from mininet.topo import Topo
from mininet.cli import CLI
from mininet.log import setLogLevel, info
from mininet.link import TCLink
import mininet.net as _mininet_net
import subprocess
import time
from functools import partial
import json
import re
import os
import sys
import urllib.request
import urllib.error
import shlex

# Helpful marker when loaded via `mn --custom ...`
try:
    sys.stderr.write("[sdn] loaded SDN/mininet_topology/topology.py\n")
except Exception:
    pass


# =========================
# ROUTER CLASS
# =========================
class LinuxRouter(Node):
    def config(self, **params):
        super(LinuxRouter, self).config(**params)
        self.cmd('sysctl -w net.ipv4.ip_forward=1')

    def terminate(self):
        self.cmd('sysctl -w net.ipv4.ip_forward=0')
        super(LinuxRouter, self).terminate()


# =========================
# TOPOLOGY CLASS
# =========================
class SDNEnterpriseTopo(Topo):

    def build(self):

        core = self.addSwitch('s1')

        user_sw1 = self.addSwitch('s2')
        user_sw2 = self.addSwitch('s3')
        user_sw3 = self.addSwitch('s4')

        server_sw = self.addSwitch('s5')
        dmz_sw = self.addSwitch('s6')
        edge_sw = self.addSwitch('s7')

        # Core links
        self.addLink(core, user_sw1)
        self.addLink(core, user_sw2)
        self.addLink(core, user_sw3)
        self.addLink(core, server_sw)
        self.addLink(core, dmz_sw)
        self.addLink(core, edge_sw)

        # Router
        router = self.addNode('r1', cls=LinuxRouter, ip='10.0.1.1/24')

        self.addLink(router, user_sw1, intfName1='r1-eth0', params1={'ip': '10.0.1.1/24'})
        self.addLink(router, server_sw, intfName1='r1-eth1', params1={'ip': '10.0.2.1/24'})
        self.addLink(router, dmz_sw, intfName1='r1-eth2', params1={'ip': '172.16.0.1/24'})
        self.addLink(router, edge_sw, intfName1='r1-eth3', params1={'ip': '192.168.100.1/24'})

        # Users
        users = [
            ('user1', '10.0.1.10/24'),
            ('user2', '10.0.1.11/24'),
            ('user3', '10.0.1.12/24'),
            ('user4', '10.0.1.13/24'),
            ('user5', '10.0.1.14/24'),
            ('user6', '10.0.1.15/24'),
        ]

        for i, (name, ip) in enumerate(users):
            host = self.addHost(name, ip=ip, defaultRoute='via 10.0.1.1')

            if i < 2:
                self.addLink(host, user_sw1)
            elif i < 4:
                self.addLink(host, user_sw2)
            else:
                self.addLink(host, user_sw3)

        # Servers
        mail_srv = self.addHost('mail_srv', ip='10.0.2.10/24', defaultRoute='via 10.0.2.1')
        file_srv = self.addHost('file_srv', ip='10.0.2.20/24', defaultRoute='via 10.0.2.1')

        self.addLink(mail_srv, server_sw)
        self.addLink(file_srv, server_sw)

        # DMZ
        web_srv = self.addHost('web_srv', ip='172.16.0.10/24', defaultRoute='via 172.16.0.1')
        self.addLink(web_srv, dmz_sw)

        # Internet attackers
        attacker = self.addHost('attacker', ip='192.168.100.10/24', defaultRoute='via 192.168.100.1')
        pub_user = self.addHost('pub_user', ip='192.168.100.20/24', defaultRoute='via 192.168.100.1')
        ddos_att = self.addHost('ddos_att', ip='192.168.100.30/24', defaultRoute='via 192.168.100.1')
        arp_att = self.addHost('arp_att', ip='192.168.100.40/24', defaultRoute='via 192.168.100.1')
        scan_att = self.addHost('scan_att', ip='192.168.100.50/24', defaultRoute='via 192.168.100.1')

        self.addLink(attacker, edge_sw)
        self.addLink(pub_user, edge_sw)
        self.addLink(ddos_att, edge_sw)
        self.addLink(arp_att, edge_sw)
        self.addLink(scan_att, edge_sw)


# =========================
# CLI (REPORT PINGS TO DASHBOARD)
# =========================
_PING_SUMMARY_RE = re.compile(
    r"(?P<tx>\d+)\s+packets transmitted,\s+(?P<rx>\d+)\s+(?:packets )?received.*?(?P<loss>\d+)%\s+packet loss",
    re.IGNORECASE,
)
_PING_RTT_RE = re.compile(
    r"rtt [^=]*=\s*(?P<min>[\d.]+)/(?P<avg>[\d.]+)/(?P<max>[\d.]+)/(?P<mdev>[\d.]+)\s+ms",
    re.IGNORECASE,
)
_PING_TIME_RE = re.compile(r"time=(?P<time>[\d.]+)\s*ms", re.IGNORECASE)
_IPV4_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")


def _post_json(url, payload, timeout=1.0):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout):
            pass
    except Exception:
        # dashboard/back-end is optional; don't break the Mininet CLI flow,
        # but do emit a lightweight hint (rate-limited) since silent failures
        # are very confusing during demos.
        global _LAST_POST_ERROR_AT
        now = time.time()
        if _LAST_POST_ERROR_AT is None or (now - _LAST_POST_ERROR_AT) > 5:
            _LAST_POST_ERROR_AT = now
            info(f"⚠️  Could not POST ping event to dashboard API at {url}. Is the Flask backend running?\n")
            try:
                sys.stderr.write(f"[sdn] ping POST failed: {url}\n")
            except Exception:
                pass
        return


_LAST_POST_ERROR_AT = None


def _default_report_url():
    explicit = os.environ.get("SDN_PING_INGEST_URL") or os.environ.get("PING_INGEST_URL")
    if explicit:
        return explicit
    base = os.environ.get("SDN_API_BASE_URL") or os.environ.get("REACT_APP_API_BASE_URL")
    if base:
        base = base.rstrip("/")
        if base.endswith("/api"):
            return f"{base}/pings/ingest"
        return f"{base}/api/pings/ingest"
    return "http://127.0.0.1:5000/api/pings/ingest"


def _health_url_from_ingest(ingest_url: str) -> str:
    url = (ingest_url or "").rstrip("/")
    if url.endswith("/api/pings/ingest"):
        return url[: -len("/api/pings/ingest")] + "/api/health"
    if url.endswith("/pings/ingest"):
        return url[: -len("/pings/ingest")] + "/health"
    # best-effort fallback
    return url + "/health"


def _probe_backend_health(ingest_url: str, timeout: float = 0.6) -> bool:
    health_url = _health_url_from_ingest(ingest_url)
    try:
        req = urllib.request.Request(health_url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= int(getattr(resp, "status", 0) or 0) < 500
    except Exception:
        return False


def _choose_report_url(initial: str) -> str:
    """
    Pick a reachable backend URL for ping ingestion.

    In many setups the dashboard is on a different host/container than Mininet,
    so 127.0.0.1 may not be correct. We try a small set of common alternatives.
    """
    candidates = []
    if initial:
        candidates.append(initial)

    # Common local variants.
    candidates.extend(
        [
            "http://127.0.0.1:5000/api/pings/ingest",
            "http://localhost:5000/api/pings/ingest",
        ]
    )

    # Common VM/container host gateways.
    candidates.extend(
        [
            "http://host.docker.internal:5000/api/pings/ingest",
            "http://172.17.0.1:5000/api/pings/ingest",
            "http://10.0.2.2:5000/api/pings/ingest",
        ]
    )

    seen = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        if _probe_backend_health(candidate):
            return candidate
    return initial or "http://127.0.0.1:5000/api/pings/ingest"


def _parse_ping_output(output):
    tx = rx = loss_pct = None
    latency_ms = 0.0

    summary_match = _PING_SUMMARY_RE.search(output or "")
    if summary_match:
        tx = int(summary_match.group("tx"))
        rx = int(summary_match.group("rx"))
        loss_pct = int(summary_match.group("loss"))

    rtt_match = _PING_RTT_RE.search(output or "")
    if rtt_match:
        latency_ms = float(rtt_match.group("avg"))
    else:
        time_match = _PING_TIME_RE.search(output or "")
        if time_match:
            latency_ms = float(time_match.group("time"))

    if loss_pct is not None:
        if loss_pct >= 100:
            status = "failed"
        elif loss_pct == 0:
            status = "success"
        else:
            status = "degraded"
    else:
        status = "failed" if "Destination Host Unreachable" in (output or "") else "success"

    return {
        "status": status,
        "packets_transmitted": tx,
        "packets_received": rx,
        "packet_loss_pct": loss_pct,
        "latency_ms": latency_ms,
    }


def _extract_ping_target(tokens):
    if not tokens or tokens[0] != "ping":
        return None
    # Some ping variants allow options after the destination (e.g. `ping host -c4`).
    # Choose the first non-option token as the destination and ignore trailing options.
    value_opts = {"-c", "-w", "-i", "-s", "-I", "-W", "-t", "-m"}
    idx = 1
    while idx < len(tokens):
        token = tokens[idx]
        if token.startswith("-"):
            if token in value_opts and idx + 1 < len(tokens):
                idx += 2
                continue
            idx += 1
            continue
        return token
    return None


def _rewrite_ping_command_for_mininet(mn, cmd):
    try:
        tokens = shlex.split(cmd)
    except Exception:
        tokens = (cmd or "").split()

    if not tokens or tokens[0] != "ping":
        return cmd, None

    target = _extract_ping_target(tokens)
    if not target:
        return cmd, None

    replacement_ip = None
    try:
        dst_node = mn[target]
        replacement_ip = dst_node.IP() if hasattr(dst_node, "IP") else None
    except Exception:
        dst_node = None

    if not replacement_ip:
        return cmd, target

    rewritten = []
    replaced = False
    value_opts = {"-c", "-w", "-i", "-s", "-I", "-W", "-t", "-m"}
    idx = 0
    while idx < len(tokens):
        token = tokens[idx]
        if idx == 0:
            rewritten.append(token)
            idx += 1
            continue
        if token.startswith("-"):
            rewritten.append(token)
            if token in value_opts and idx + 1 < len(tokens):
                rewritten.append(tokens[idx + 1])
                idx += 2
                continue
            idx += 1
            continue
        if not replaced:
            rewritten.append(replacement_ip)
            replaced = True
        else:
            rewritten.append(token)
        idx += 1

    return " ".join(rewritten), target


def _silent_ping_full(net, hosts=None, timeout=None):
    original_output = _mininet_net.output
    try:
        _mininet_net.output = lambda *args, **kwargs: None
        return net.pingFull(hosts=hosts, timeout=timeout)
    finally:
        _mininet_net.output = original_output


def _collect_ping_results(hosts, timeout=None):
    results = []
    host_list = list(hosts or [])
    timeout_opt = f"-W {timeout}" if timeout else "-W 1"
    for index, src_node in enumerate(host_list):
        for dst_node in host_list[index + 1:]:
            command = f"ping -n -q -c1 {timeout_opt} {dst_node.IP()}".strip()
            output = src_node.cmd(command)
            parsed = _parse_ping_output(output)
            sent = int(parsed.get("packets_transmitted") or 1)
            received = int(parsed.get("packets_received") or 0)
            avg = float(parsed.get("latency_ms") or 0.0)
            results.append((src_node, dst_node, (sent, received, avg, avg, avg, 0.0)))
    return results


def _print_ping_summary(results, label="Pingall"):
    total = len(results or [])
    success = 0
    for _src_node, _dst_node, outputs in (results or []):
        try:
            _sent, received, _rttmin, _rttavg, _rttmax, _rttdev = outputs
            if int(received or 0) > 0:
                success += 1
        except Exception:
            continue
    dropped = max(0, total - success)
    loss_pct = int(round((dropped / float(total)) * 100)) if total else 0
    sys.stdout.write(f"*** Results: {loss_pct}% dropped ({success}/{total} received)\n")
    sys.stdout.flush()


def _print_ping_reachability(results, label="Pingall"):
    result_map = {}
    host_names = []

    for src_node, dst_node, outputs in (results or []):
        src_name = getattr(src_node, "name", str(src_node))
        dst_name = getattr(dst_node, "name", str(dst_node))
        if src_name not in host_names:
            host_names.append(src_name)
        if dst_name not in host_names:
            host_names.append(dst_name)

        try:
            _sent, received, _rttmin, _rttavg, _rttmax, _rttdev = outputs
            ok = int(received or 0) > 0
        except Exception:
            ok = False

        result_map[(src_name, dst_name)] = ok
        result_map[(dst_name, src_name)] = ok

    heading = "Ping" if label == "Pingall" else label
    sys.stdout.write(f"*** {heading}: testing ping reachability\n")
    for src_name in host_names:
        peers = []
        for dst_name in host_names:
            if src_name == dst_name:
                continue
            peers.append(dst_name if result_map.get((src_name, dst_name), False) else "X")

        detail = " ".join(peers) if peers else "no peers"
        sys.stdout.write(f"{src_name} -> {detail}\n")

    sys.stdout.flush()



class ReportingCLI(CLI):
    prompt = "mininet> "

    def __init__(self, *args, report_url=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.report_url = _choose_report_url(report_url or _default_report_url())
        info(f"📡 Ping reporting enabled: {self.report_url}\n")
        try:
            sys.stderr.write(f"[sdn] reporting_cli=1 ingest_url={self.report_url}\n")
        except Exception:
            pass

    def _maybe_report_ping(self, src_host, cmd, output, display_target=None):
        try:
            tokens = shlex.split(cmd)
        except Exception:
            tokens = (cmd or "").split()

        if not tokens or tokens[0] != "ping":
            return

        target = display_target or _extract_ping_target(tokens) or tokens[-1]
        src_node = None
        dst_node = None

        try:
            src_node = self.mn[src_host]
        except Exception:
            return

        try:
            dst_node = self.mn[target]
        except Exception:
            dst_node = None

        src_ip = ""
        dst_ip = ""
        try:
            src_ip = src_node.IP()
        except Exception:
            pass

        if dst_node is not None:
            try:
                dst_ip = dst_node.IP()
            except Exception:
                pass
        elif _IPV4_RE.match(target or ""):
            dst_ip = target

        parsed = _parse_ping_output(output)

        packets_count = parsed["packets_transmitted"] if parsed["packets_transmitted"] is not None else 1
        payload = {
            "src_host": src_host,
            "dst_host": target,
            "src_ip": src_ip,
            "dst_ip": dst_ip,
            "protocol": "ICMP",
            "bytes": 64,
            "packets": packets_count,
            "latency_ms": parsed["latency_ms"],
            "status": parsed["status"],
            "command": f"{src_host} {cmd}",
            "output": (output or "").strip(),
            "origin": "mininet-cli",
        }

        if parsed["packets_transmitted"] is not None:
            payload["packets_transmitted"] = parsed["packets_transmitted"]
        if parsed["packets_received"] is not None:
            payload["packets_received"] = parsed["packets_received"]
        if parsed["packet_loss_pct"] is not None:
            payload["packet_loss_pct"] = parsed["packet_loss_pct"]
            payload["packet_loss"] = f"{parsed['packet_loss_pct']}%"

        _post_json(self.report_url, payload)

    def default(self, line):
        line = (line or "").strip()
        if not line:
            return

        first, *rest = line.split()
        if not rest:
            return super().default(line)

        try:
            node = self.mn[first]
        except Exception:
            return super().default(line)

        cmd = " ".join(rest)
        # Ensure pings terminate so we can reliably report them to the dashboard.
        # Users can still run a fully custom ping via something like:
        #   ddos_att bash -lc "ping user1"
        try:
            tokens = shlex.split(cmd)
        except Exception:
            tokens = cmd.split()
        if tokens and tokens[0] == "ping" and "-c" not in tokens and "-w" not in tokens:
            cmd = "ping -c 10 -w 12 " + " ".join(tokens[1:])

        display_target = None
        if tokens and tokens[0] == "ping":
            cmd, display_target = _rewrite_ping_command_for_mininet(self.mn, cmd)

        output = ""
        try:
            output = node.cmd(cmd)
        except KeyboardInterrupt:
            try:
                node.sendInt()
            except Exception:
                pass
            try:
                output = (output or "") + node.waitOutput()
            except Exception:
                pass

        if output:
            self.stdout.write(output)
            self.stdout.flush()

        self._maybe_report_ping(first, cmd, output, display_target=display_target)
        return

    def _report_structured_ping(self, src_node, dst_node, sent, received, rttavg_ms, origin="mininet-cli"):
        try:
            sent_i = int(sent)
        except Exception:
            sent_i = 1
        try:
            received_i = int(received)
        except Exception:
            received_i = 0

        loss_pct = None
        if sent_i:
            loss_pct = int(round(((sent_i - received_i) / float(sent_i)) * 100))

        status = "success" if received_i else "failed"

        payload = {
            "src_host": getattr(src_node, "name", str(src_node)),
            "dst_host": getattr(dst_node, "name", str(dst_node)),
            "src_ip": src_node.IP() if hasattr(src_node, "IP") else "",
            "dst_ip": dst_node.IP() if hasattr(dst_node, "IP") else "",
            "protocol": "ICMP",
            "bytes": 64,
            "packets": sent_i,
            "packets_transmitted": sent_i,
            "packets_received": received_i,
            "packet_loss_pct": loss_pct,
            "packet_loss": f"{loss_pct}%" if loss_pct is not None else None,
            "latency_ms": float(rttavg_ms or 0),
            "status": status,
            "command": f"{getattr(src_node, 'name', src_node)} ping {getattr(dst_node, 'name', dst_node)}",
            "output": "",
            "origin": origin,
        }
        _post_json(self.report_url, payload)

    def do_pingall(self, line):
        "Ping between all hosts (and report results to dashboard)."
        timeout = (line or "").strip() or None
        try:
            results = _collect_ping_results(self.mn.hosts, timeout=timeout)
        except Exception:
            # Fall back to the default behavior if pingFull is unavailable.
            return super().do_pingall(line)

        # results: list of (src, dst, (sent, received, rttmin, rttavg, rttmax, rttdev))
        for src_node, dst_node, outputs in results:
            try:
                sent, received, _rttmin, rttavg, _rttmax, _rttdev = outputs
            except Exception:
                continue
            self._report_structured_ping(src_node, dst_node, sent, received, rttavg, origin="mininet-cli:pingall")
        _print_ping_reachability(results, label="Pingall")
        _print_ping_summary(results, label="Pingall")
        return

    def do_pingpair(self, line):
        "Ping between first two hosts (and report results to dashboard)."
        timeout = (line or "").strip() or None
        try:
            hosts = self.mn.hosts[:2]
            results = _collect_ping_results(hosts, timeout=timeout)
        except Exception:
            return super().do_pingpair(line)

        for src_node, dst_node, outputs in results:
            try:
                sent, received, _rttmin, rttavg, _rttmax, _rttdev = outputs
            except Exception:
                continue
            self._report_structured_ping(src_node, dst_node, sent, received, rttavg, origin="mininet-cli:pingpair")
        _print_ping_reachability(results, label="Pingpair")
        _print_ping_summary(results, label="Pingpair")
        return

    def do_pingreport(self, _line):
        "Show configured ping ingest URL and do a quick reachability check."
        info(f"ping_ingest_url={self.report_url}\n")
        try:
            health_url = _health_url_from_ingest(self.report_url)
            req = urllib.request.Request(health_url, method="GET")
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                info(f"backend_health_url={health_url}\n")
                info(f"backend_health_http={resp.status}\n")
        except Exception as e:
            info(f"backend_health_error={e}\n")
        return

    def do_pingposttest(self, _line):
        "POST a dummy ping event to verify backend ingestion works."
        payload = {
            "src_host": "mininet",
            "dst_host": "dashboard",
            "src_ip": "0.0.0.0",
            "dst_ip": "0.0.0.0",
            "protocol": "ICMP",
            "bytes": 64,
            "packets": 1,
            "packets_transmitted": 1,
            "packets_received": 1,
            "packet_loss_pct": 0,
            "packet_loss": "0%",
            "latency_ms": 1.0,
            "status": "success",
            "command": "pingposttest",
            "output": "ok",
            "origin": "mininet-cli:pingposttest",
        }
        _post_json(self.report_url, payload)
        info("posted_dummy_ping=1\n")
        return


# If this file is loaded via `mn --custom ...`, Mininet will use the default
# `mininet.cli.CLI` class unless we replace it. Monkey-patching here ensures
# the dashboard reporting works even when the topology is started via `mn`.
try:
    import mininet.cli as _mininet_cli  # type: ignore

    _orig_cli_init = getattr(_mininet_cli.CLI, "__init__", None)
    _orig_cli_default = getattr(_mininet_cli.CLI, "default", None)

    # Patch the original CLI class in-place so even a previously imported
    # `from mininet.cli import CLI` gets the reporting behavior.
    def _patched_cli_init(self, *args, **kwargs):  # type: ignore
        if _orig_cli_init:
            _orig_cli_init(self, *args, **kwargs)
        # Configure reporting URL on every CLI instance.
        self.report_url = _choose_report_url(_default_report_url())
        try:
            sys.stderr.write(f"[sdn] reporting_cli=1 ingest_url={self.report_url}\n")
        except Exception:
            pass

    def _patched_cli_default(self, line):  # type: ignore
        line = (line or "").strip()
        if not line:
            return

        first, *rest = line.split()
        if not rest:
            return _orig_cli_default(self, line) if _orig_cli_default else None

        try:
            node = self.mn[first]
        except Exception:
            return _orig_cli_default(self, line) if _orig_cli_default else None

        cmd = " ".join(rest)
        try:
            tokens = shlex.split(cmd)
        except Exception:
            tokens = cmd.split()
        if tokens and tokens[0] == "ping" and "-c" not in tokens and "-w" not in tokens:
            cmd = "ping -c 10 -w 12 " + " ".join(tokens[1:])

        display_target = None
        if tokens and tokens[0] == "ping":
            cmd, display_target = _rewrite_ping_command_for_mininet(self.mn, cmd)

        output = ""
        try:
            output = node.cmd(cmd)
        except KeyboardInterrupt:
            try:
                node.sendInt()
            except Exception:
                pass
            try:
                output = (output or "") + node.waitOutput()
            except Exception:
                pass

        if output:
            self.stdout.write(output)
            self.stdout.flush()

        # Report any host-executed ping.
        try:
            ReportingCLI._maybe_report_ping(self, first, cmd, output, display_target=display_target)  # type: ignore
        except Exception:
            pass
        return

    def _patched_cli_do_pingall(self, line):  # type: ignore
        timeout = (line or "").strip() or None
        try:
            results = _collect_ping_results(self.mn.hosts, timeout=timeout)
            for src_node, dst_node, outputs in results:
                try:
                    sent, received, _rttmin, rttavg, _rttmax, _rttdev = outputs
                except Exception:
                    continue
                ReportingCLI._report_structured_ping(self, src_node, dst_node, sent, received, rttavg, origin="mininet-cli:pingall")  # type: ignore
            _print_ping_reachability(results, label="Pingall")
            _print_ping_summary(results, label="Pingall")
            return
        except Exception:
            return _mininet_cli.CLI.do_pingall(self, line)

    def _patched_cli_do_pingpair(self, line):  # type: ignore
        timeout = (line or "").strip() or None
        try:
            hosts = self.mn.hosts[:2]
            results = _collect_ping_results(hosts, timeout=timeout)
            for src_node, dst_node, outputs in results:
                try:
                    sent, received, _rttmin, rttavg, _rttmax, _rttdev = outputs
                except Exception:
                    continue
                ReportingCLI._report_structured_ping(self, src_node, dst_node, sent, received, rttavg, origin="mininet-cli:pingpair")  # type: ignore
            _print_ping_reachability(results, label="Pingpair")
            _print_ping_summary(results, label="Pingpair")
            return
        except Exception:
            return _mininet_cli.CLI.do_pingpair(self, line)

    # Apply patches to the class object.
    _mininet_cli.CLI.__init__ = _patched_cli_init  # type: ignore
    _mininet_cli.CLI.default = _patched_cli_default  # type: ignore
    _mininet_cli.CLI.do_pingall = _patched_cli_do_pingall  # type: ignore
    _mininet_cli.CLI.do_pingpair = _patched_cli_do_pingpair  # type: ignore
    _mininet_cli.CLI.do_pingreport = ReportingCLI.do_pingreport  # type: ignore
    _mininet_cli.CLI.do_pingposttest = ReportingCLI.do_pingposttest  # type: ignore

    # And keep the nicer prompt when possible.
    try:
        _mininet_cli.CLI.prompt = ReportingCLI.prompt  # type: ignore
    except Exception:
        pass
except Exception:
    pass


# =========================
# RUN MININET
# =========================
def run():
    topo = SDNEnterpriseTopo()

    net = Mininet(
        topo=topo,
        controller=lambda name: RemoteController(name, ip='127.0.0.1', port=6633),
        # Ryu app speaks OpenFlow 1.3; make OVS match to avoid silent handshake failures
        # Also allow standalone forwarding if the controller isn't connected yet.
        switch=partial(OVSSwitch, protocols='OpenFlow13', failMode='standalone'),
        link=TCLink,
        autoSetMacs=True
    )

    info("\n=== Starting Network ===\n")

    net.start()

    info("\n=== Network Ready ===\n")

    ReportingCLI(net)

    net.stop()


# =========================
# MAIN
# =========================
if __name__ == '__main__':
    setLogLevel('info')
    run()


# =========================
# TOPO NAME FOR MININET CLI
# =========================
topos = {
    'sdnenterprise': lambda: SDNEnterpriseTopo()
}
