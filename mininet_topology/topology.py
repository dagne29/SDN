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
import time


def create_topology():

    net = Mininet(controller=RemoteController,
                  switch=OVSSwitch,
                  link=TCLink,
                  autoSetMacs=True)

    info('\n=== 🚀 Creating ULTRA SDN Topology ===\n')

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
            host = net.addHost(f'h{i}{j}', ip=f'192.168.{i}.{j}/24')
            dept_hosts.append(host)
            net.addLink(host, sw, bw=10, delay='5ms', loss=1)

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

    # Add 6 hosts for Bahrdar campus (h71..h76)
    for j in range(1, 7):
        host = net.addHost(f'h7{j}', ip=f'192.168.50.{j}/24')
        net.addLink(host, bah_sw, bw=20, delay='5ms')

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

    # =========================
    # 🧪 TESTING
    # =========================
    info('\n=== 🔍 Running Ping Test ===\n')
    net.pingAll()

    # Start services
    info('\n=== 🌐 Starting Servers ===\n')
    web.cmd('python3 -m http.server 80 &')
    ftp.cmd('python3 -m http.server 21 &')

    # =========================
    # 🚨 ATTACK SIMULATION
    # =========================
    info('\n=== ⚠️ Launching Attacks ===\n')

    attacker_icmp.cmd('ping -f 192.168.20.10 &')
    attacker_syn.cmd('hping3 -S 192.168.20.10 -p 80 --flood &')

    # =========================
    # 📊 MONITORING
    # =========================
    def monitor():
        while True:
            info("\n📊 Monitoring Traffic...\n")
            time.sleep(10)

    # =========================
    # 🖥️ CLI
    # =========================
    CLI(net)

    # =========================
    # 🛑 STOP
    # =========================
    info('\n=== 🛑 Stopping Network ===\n')
    net.stop()


if __name__ == '__main__':
    setLogLevel('info')
    create_topology()