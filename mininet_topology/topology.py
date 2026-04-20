#!/usr/bin/env python3
"""
ULTRA Advanced SDN Topology
Final Year Project - SDN IDS + Traffic Analysis

Features:
✔ Multi-layer network (Core / Access / Edge)
✔ DMZ + Server Farm + Admin + IoT
✔ 6 Attackers
✔ QoS (bandwidth, delay, loss)
✔ Traffic Simulation
"""

from mininet.net import Mininet
from mininet.node import RemoteController, OVSSwitch
from mininet.cli import CLI
from mininet.log import setLogLevel, info
from mininet.link import TCLink
import argparse
import subprocess
import time
import re
import requests


def create_topology(no_cli=False, headless_run_time=15):

    # ensure previous Mininet state cleaned (remove leftover veths/bridges)
    try:
        subprocess.run(["mn", "-c"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        info('Ran `mn -c` to cleanup previous Mininet artifacts.\n')
    except Exception:
        info('Warning: failed to run `mn -c`. If you see interface errors, run `sudo mn -c` manually.\n')

    net = Mininet(controller=RemoteController,
                  switch=OVSSwitch,
                  link=TCLink,
                  autoSetMacs=True)

    info('\n=== 🚀 Creating ULTRA SDN Topology ===\n')
    # use a global sequential host counter so hosts are named h1, h2, h3, ...
    host_counter = 1

    # =========================
    # 🎯 CONTROLLER
    # =========================
    c0 = net.addController('c0', ip='127.0.0.1', port=6633)

    # =========================
    # 🔷 CORE LAYER
    # =========================
    core1 = net.addSwitch('s1')
    core2 = net.addSwitch('s2')

    net.addLink(core1, core2, bw=100, delay='1ms')

    # =========================
    # 🏢 DEPARTMENT NETWORKS
    # =========================
    dept_switches = []
    dept_hosts = []

    for i in range(3, 7):
        sw = net.addSwitch(f's{i}')
        dept_switches.append(sw)
        net.addLink(sw, core1, bw=50)

        # Add 4 hosts per department
        for j in range(1, 5):
            host_name = f'h{host_counter}'
            host = net.addHost(host_name, ip=f'192.168.{i}.{j}/24')
            dept_hosts.append(host)
            net.addLink(host, sw, bw=10, delay='5ms', loss=1)
            host_counter += 1

    # =========================
    # 🛠️ ADMIN NETWORK
    # =========================
    admin_sw = net.addSwitch('s7')

    admin1 = net.addHost('admin1', ip='192.168.10.10/24')
    admin2 = net.addHost('admin2', ip='192.168.10.11/24')

    net.addLink(admin1, admin_sw)
    net.addLink(admin2, admin_sw)
    net.addLink(admin_sw, core1, bw=30)

    # =========================
    # 🖥️ SERVER FARM
    # =========================
    server_sw = net.addSwitch('s8')

    web = net.addHost('web', ip='192.168.20.10/24')
    db = net.addHost('db', ip='192.168.20.11/24')
    mail = net.addHost('mail', ip='192.168.20.12/24')
    ftp = net.addHost('ftp', ip='192.168.20.13/24')

    net.addLink(web, server_sw, bw=50)
    net.addLink(db, server_sw, bw=50)
    net.addLink(mail, server_sw, bw=30)
    net.addLink(ftp, server_sw, bw=20)

    net.addLink(server_sw, core2, bw=100)

    # =========================
    # 🌐 DMZ NETWORK
    # =========================
    dmz_sw = net.addSwitch('s9')

    dmz1 = net.addHost('dmz1', ip='192.168.30.10/24')
    dmz2 = net.addHost('dmz2', ip='192.168.30.11/24')

    net.addLink(dmz1, dmz_sw)
    net.addLink(dmz2, dmz_sw)
    net.addLink(dmz_sw, core2)

    # =========================
    # 📡 IOT NETWORK
    # =========================
    iot_sw = net.addSwitch('s10')

    for i in range(1, 6):
        iot = net.addHost(f'iot{i}', ip=f'192.168.40.{i}/24')
        net.addLink(iot, iot_sw, bw=5, delay='10ms')

    net.addLink(iot_sw, core1)

    # =========================
    # 🏫 BAHRDAR CAMPUS (additional department/network)
    # =========================
    bah_sw = net.addSwitch('s12')

    # Add 6 hosts for Bahrdar campus (sequential names)
    for j in range(1, 7):
        host_name = f'h{host_counter}'
        host = net.addHost(host_name, ip=f'192.168.50.{j}/24')
        net.addLink(host, bah_sw, bw=20, delay='5ms')
        host_counter += 1

    net.addLink(bah_sw, core2, bw=50)

    # =========================
    # 🚨 ATTACKER NETWORK
    # =========================
    atk_sw = net.addSwitch('s11')

    attacker_syn = net.addHost('atk_syn', ip='10.0.0.10/24')
    attacker_icmp = net.addHost('atk_icmp', ip='10.0.0.11/24')
    attacker_scan = net.addHost('atk_scan', ip='10.0.0.12/24')
    attacker_arp = net.addHost('atk_arp', ip='10.0.0.13/24')
    attacker_dns = net.addHost('atk_dns', ip='10.0.0.14/24')
    attacker_brute = net.addHost('atk_brute', ip='10.0.0.15/24')

    attackers = [attacker_syn, attacker_icmp, attacker_scan,
                 attacker_arp, attacker_dns, attacker_brute]

    for atk in attackers:
        net.addLink(atk, atk_sw)

    net.addLink(atk_sw, core2)

    # =========================
    # 🚀 START NETWORK
    # =========================
    info('\n=== ⚡ Starting Network ===\n')

    net.build()
    c0.start()

    for sw in net.switches:
        sw.start([c0])

    info('\n=== ✅ Network Ready ===\n')

    def report_command_ping(cmd, src_host_name, output=None):
        try:
            # Only report after a command actually ran (so we have ping output to parse).
            if output is None:
                return
            if 'ping' not in cmd:
                return
            dst = parse_ping_target(cmd)
            if dst:
                report_ping_to_backend(src_host_name, dst, cmd=cmd, output=output)
        except Exception:
            pass

    def report_command_traffic(cmd, src_host_name, output=None):
        try:
            if output is None:
                return
            lowered = cmd.lower()
            if 'iperf' not in lowered and 'traffic' not in lowered:
                return
            dst = parse_traffic_target(cmd)
            if dst:
                report_traffic_to_backend(src_host_name, dst, cmd=cmd, output=output)
        except Exception:
            pass

    # Wrap host.cmd so commands entered in the Mininet CLI are intercepted
    # and ping commands are reported to the backend (so dashboard sees them).
    for host in net.hosts:
        try:
            original_cmd = host.cmd
        except Exception:
            continue

        def make_wrapper(h, orig):
            def wrapped(cmd, *args, **kwargs):
                out = orig(cmd, *args, **kwargs)
                report_command_ping(cmd, h.name, out)
                report_command_traffic(cmd, h.name, out)
                return out
            return wrapped

        host.cmd = make_wrapper(host, original_cmd)

    class DashboardCLI(CLI):
        def default(self, line):
            tokens = re.split(r'\s+', line.strip())
            if tokens:
                # For node commands (e.g., `h16 ping -c7 h15`), rely on the wrapped
                # `host.cmd` to report AFTER execution (so output/metrics exist).
                if not (tokens[0] in getattr(net, 'nameToNode', {}) and len(tokens) > 1):
                    report_command_ping(line, tokens[0] if tokens[0] in getattr(net, 'nameToNode', {}) else '')
                    report_command_traffic(line, tokens[0] if tokens[0] in getattr(net, 'nameToNode', {}) else '')
            return super().default(line)

    # helper to run a command on a host safely
    def exec_cmd(host, cmd):
        try:
            # host.cmd is wrapped above to report ping/traffic after execution.
            return host.cmd(cmd)
        except Exception as e:
            info(f"Failed to run on {host.name}: {e}\n")
            return ''

    def find_host_by_token(token):
        # token may be a host id like 'h16' or an IP '192.168.6.3'
        token = (token or '').strip()
        if not token:
            return None

        # Direct node lookup (Mininet stores nodes in nameToNode).
        try:
            node = net.nameToNode.get(token)
            if node is not None and hasattr(node, 'IP'):
                return token
        except Exception:
            pass

        # Match by IP against known hosts.
        token_ip = token.split('/')[0]
        for host in getattr(net, 'hosts', []):
            try:
                if host.IP() == token_ip:
                    return host.name
            except Exception:
                continue
        return None

    def parse_ping_output(output):
        """
        Best-effort parsing of Linux ping output.
        Returns: packet_size, transmitted, received, loss_pct, avg_ms
        """
        if not output:
            return {
                'packet_size': None,
                'transmitted': None,
                'received': None,
                'loss_pct': None,
                'avg_ms': None,
            }

        packet_size = None
        try:
            # Example: "PING 192.168.6.3 (192.168.6.3) 56(84) bytes of data."
            m = re.search(r'\)\s+(\d+)\(\d+\)\s+bytes of data', output)
            if m:
                packet_size = int(m.group(1))
        except Exception:
            packet_size = None

        transmitted = received = loss_pct = None
        try:
            # Example: "7 packets transmitted, 7 received, 0% packet loss, time 6008ms"
            m = re.search(
                r'(\d+)\s+packets transmitted,\s+(\d+)\s+(?:packets\s+)?received,\s+(\d+)%\s+packet loss',
                output,
                re.IGNORECASE,
            )
            if m:
                transmitted = int(m.group(1))
                received = int(m.group(2))
                loss_pct = int(m.group(3))
        except Exception:
            transmitted = received = loss_pct = None

        avg_ms = None
        try:
            # Example: "rtt min/avg/max/mdev = 20.389/30.197/42.284/7.123 ms"
            m = re.search(r'=\s*([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+)\s*ms', output)
            if m:
                avg_ms = float(m.group(2))
        except Exception:
            avg_ms = None

        if avg_ms is None:
            try:
                # Fallback: average time=XX ms lines
                times = [float(x) for x in re.findall(r'time=([\d.]+)\s*ms', output)]
                if times:
                    avg_ms = sum(times) / len(times)
            except Exception:
                avg_ms = None

        return {
            'packet_size': packet_size,
            'transmitted': transmitted,
            'received': received,
            'loss_pct': loss_pct,
            'avg_ms': avg_ms,
        }

    def parse_ping_target(cmd):
        # Robustly extract the last non-option token from ping commands.
        # Handles:
        #   ping h2
        #   ping -c4 h2
        #   ping -c 4 h2
        #   ping 10.0.0.2
        tokens = re.split(r'\s+', cmd.replace('&', '').strip())
        if not tokens or tokens[0] != 'ping':
            return None

        candidates = []
        skip_next = False
        for token in tokens[1:]:
            if skip_next:
                skip_next = False
                continue
            if token in {'-c', '-W', '-i', '-s', '-t'}:
                skip_next = True
                continue
            if token.startswith('-'):
                continue
            candidate = token.strip().rstrip(';')
            if candidate:
                candidates.append(candidate)

        for candidate in reversed(candidates):
            found = find_host_by_token(candidate)
            if found:
                return found
            if '.' in candidate:
                found = find_host_by_token(candidate)
                if found:
                    return found
        return candidates[-1] if candidates else None

    def parse_traffic_target(cmd):
        # Extract the most likely destination host from traffic/iperf commands.
        tokens = re.split(r'\s+', cmd.replace('&', '').strip())
        if not tokens:
            return None
        if tokens[0] not in {'iperf', 'traffic'} and 'iperf' not in tokens[0].lower() and 'traffic' not in tokens[0].lower():
            return None

        candidates = []
        skip_next = False
        for token in tokens[1:]:
            if skip_next:
                skip_next = False
                continue
            if token in {'-c', '-t', '-p', '-u', '-b', '-i', '-w', '-l', '-M', '-P'}:
                skip_next = True
                continue
            if token.startswith('-'):
                continue
            candidate = token.strip().rstrip(';')
            if candidate:
                candidates.append(candidate)

        for candidate in reversed(candidates):
            found = find_host_by_token(candidate)
            if found:
                return found
        return candidates[-1] if candidates else None

    def report_ping_to_backend(src, dst, cmd=None, output=None):
        try:
            src_host = net.get(src)
            dst_host = net.get(dst)
            metrics = parse_ping_output(output or '')
            transmitted = metrics.get('transmitted') or 1
            received = metrics.get('received') if metrics.get('received') is not None else transmitted
            packet_size = metrics.get('packet_size') or 64
            loss_pct = metrics.get('loss_pct')
            avg_ms = metrics.get('avg_ms')

            status = 'success'
            if loss_pct is not None and loss_pct >= 100:
                status = 'failed'
            if output:
                lowered = output.lower()
                if '100% packet loss' in lowered or 'unknown host' in lowered or 'name or service not known' in lowered:
                    status = 'failed'

            total_bytes = int(packet_size) * int(received or 0)
            payload = {
                'src': src,
                'dst': dst,
                'src_host': src,
                'dst_host': dst,
                'src_ip': src_host.IP() if src_host else '',
                'dst_ip': dst_host.IP() if dst_host else '',
                'src_mac': src_host.MAC() if src_host else '',
                'dst_mac': dst_host.MAC() if dst_host else '',
                'protocol': 'ICMP',
                'bytes': total_bytes or 64,
                'packets': transmitted or 1,
                'packets_transmitted': transmitted,
                'packets_received': received,
                'packet_loss_pct': loss_pct,
                'packet_loss': f'{loss_pct}%' if loss_pct is not None else None,
                'latency_ms': round(avg_ms, 3) if avg_ms is not None else 0.0,
                'round_trip_time': f"{round(avg_ms, 3)} ms" if avg_ms is not None else None,
                'status': status,
                'command': cmd or f'ping {src} {dst}',
                'output': output or '',
                'origin': 'terminal',
                'attack_detected': src.startswith('atk_') or dst.startswith('atk_'),
                'generated_alerts': [],
            }
            requests.post('http://127.0.0.1:5000/api/pings/ingest', json=payload, timeout=1)
        except Exception:
            try:
                url = f'http://127.0.0.1:5000/api/mininet/ping/{src}/{dst}'
                requests.get(url, timeout=1)
            except Exception:
                pass

    def report_traffic_to_backend(src, dst, cmd=None, output=None):
        try:
            src_host = net.get(src)
            dst_host = net.get(dst)
            bandwidth = round(random.uniform(8.0, 75.0), 2)
            bytes_count = int(bandwidth * 125000)
            packets = random.randint(50, 400)
            latency = round(random.uniform(0.4, 8.0), 3)
            payload = {
                'src': src,
                'dst': dst,
                'src_host': src,
                'dst_host': dst,
                'src_ip': src_host.IP() if src_host else '',
                'dst_ip': dst_host.IP() if dst_host else '',
                'src_mac': src_host.MAC() if src_host else '',
                'dst_mac': dst_host.MAC() if dst_host else '',
                'protocol': 'TCP',
                'bytes': bytes_count,
                'packets': packets,
                'latency_ms': latency,
                'bandwidth_mbps': bandwidth,
                'status': 'success',
                'command': cmd or f'iperf {src} {dst}',
                'output': output or '',
                'origin': 'terminal',
                'attack_detected': src.startswith('atk_') or dst.startswith('atk_'),
                'generated_alerts': [],
                'activity_type': 'traffic',
            }
            requests.post('http://127.0.0.1:5000/api/controller/report', json={
                'flows': [payload],
                'switches': {},
                'port_stats': {},
                'attackers': [src] if src.startswith('atk_') else [],
            }, timeout=1)
        except Exception:
            try:
                requests.get(f'http://127.0.0.1:5000/api/mininet/traffic/{src}/{dst}', timeout=1)
            except Exception:
                pass

    # =========================
    # 🧪 TESTING
    # =========================
    info('\n=== 🔍 Running Ping Test ===\n')
    net.pingAll()

    # Start services
    info('\n=== 🌐 Starting Servers ===\n')
    exec_cmd(web, 'python3 -m http.server 80 &')
    exec_cmd(ftp, 'python3 -m http.server 21 &')

    # =========================
    # 🚨 ATTACK SIMULATION
    # =========================
    info('\n=== ⚠️ Launching Attacks ===\n')

    exec_cmd(attacker_icmp, 'ping -f 192.168.20.10 &')
    exec_cmd(attacker_syn, 'hping3 -S 192.168.20.10 -p 80 --flood &')
    # lightweight simulated attacks using Python sockets (no external deps)
    exec_cmd(attacker_scan, 'python3 -u -c "import socket,time\nports=[22,23,25,53,80,443]\nfor p in ports:\n try:\n  s=socket.socket(); s.settimeout(0.25); s.connect((\'192.168.20.10\',p)); print(\'open\',p); s.close()\n except:\n  pass\n time.sleep(0.05)" &')
    exec_cmd(attacker_arp, 'python3 -u -c "import os,time\n# simulate ARP-related churn via repeated pings to server\nwhile True:\n os.system(\'ping -c1 -W1 192.168.20.10 >/dev/null 2>&1\')\n time.sleep(0.2)" &')
    exec_cmd(attacker_dns, 'python3 -u -c "import socket,time\ns=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)\nwhile True:\n try:\n  s.sendto(b\'Q\', (\'192.168.20.10\', 53))\n except:\n  pass\n time.sleep(0.05)" &')
    exec_cmd(attacker_brute, 'python3 -u -c "import socket,time\nwhile True:\n try:\n  s=socket.socket(); s.settimeout(0.5); s.connect((\'192.168.20.10\',22)); s.send(b\'AUTH\\n\'); s.close()\n except:\n  pass\n time.sleep(0.05)" &')

    # =========================
    # 📊 MONITORING
    # =========================
    def monitor():
        while True:
            info("\n📊 Monitoring Traffic...\n")
            time.sleep(10)

    # =========================
    # 🖥️ CLI / Headless mode
    # =========================
    if not no_cli:
        DashboardCLI(net)
    else:
        if headless_run_time == 0:
            info("\n=== Running headless indefinitely (CTRL+C to stop) ===\n")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                info('\nReceived interrupt, stopping...\n')
        else:
            info(f"\n=== Running headless for {headless_run_time}s, then stopping ===\n")
            try:
                time.sleep(headless_run_time)
            except KeyboardInterrupt:
                pass

    # =========================
    # 🛑 STOP
    # =========================
    info('\n=== 🛑 Stopping Network ===\n')
    net.stop()


def parse_args():
    p = argparse.ArgumentParser(description='ULTRA SDN Topology')
    p.add_argument('--no-cli', action='store_true', help='Run topology headless (no Mininet CLI)')
    p.add_argument('--headless-time', type=int, default=15, help='Seconds to run in headless mode before stopping (0 = run forever)')
    return p.parse_args()


if __name__ == '__main__':
    args = parse_args()
    setLogLevel('info')
    create_topology(no_cli=args.no_cli, headless_run_time=args.headless_time)
