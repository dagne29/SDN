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
                try:
                    if 'ping' in cmd:
                        parts = cmd.replace('&', '').split()
                        dst = None
                        for p in parts[1:]:
                            if p.startswith('-'):
                                continue
                            candidate = p.strip().rstrip(';')
                            found = find_host_by_token(candidate)
                            if found:
                                dst = found
                                break
                            if '.' in candidate:
                                found = find_host_by_token(candidate)
                                if found:
                                    dst = found
                                    break
                        if dst:
                            report_ping_to_backend(h.name, dst)
                except Exception:
                    pass
                return out
            return wrapped

        host.cmd = make_wrapper(host, original_cmd)

    # helper to run a command on a host safely
    def exec_cmd(host, cmd):
        try:
            out = host.cmd(cmd)
            # detect ping commands and report to backend for dashboard/IDS
            if 'ping' in cmd:
                parts = cmd.replace('&','').split()
                # find a token that looks like a host or ip (not an option like -f or -c4)
                dst = None
                for p in parts[1:]:
                    if p.startswith('-'):
                        continue
                    candidate = p.strip()
                    # strip common suffixes
                    candidate = candidate.rstrip(';')
                    found = find_host_by_token(candidate)
                    if found:
                        dst = found
                        break
                    # try raw token if looks like ip
                    if '.' in candidate:
                        found = find_host_by_token(candidate)
                        if found:
                            dst = found
                            break
                if dst:
                    report_ping_to_backend(host.name, dst)
            return out
        except Exception as e:
            info(f"Failed to run on {host.name}: {e}\n")
            return ''

    def find_host_by_token(token):
        # token may be a hostname like 'h1' or an IP '192.168.20.10'
        token = token.strip()
        # direct host id
        if token in net.hosts:
            return token
        # match by ip (strip possible trailing chars)
        for hname, hdata in net.hosts.items():
            ip = hdata.get('ip', '')
            if ip and token in ip:
                return hname
            if ip and token == ip.split('/')[0]:
                return hname
        return None

    def report_ping_to_backend(src, dst):
        try:
            url = f'http://127.0.0.1:5000/api/mininet/ping/{src}/{dst}'
            # fire-and-forget with short timeout
            requests.get(url, timeout=1)
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
        CLI(net)
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