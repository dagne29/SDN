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
import subprocess
import time


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
# RUN MININET
# =========================
def run():
    topo = SDNEnterpriseTopo()

    net = Mininet(
        topo=topo,
        controller=lambda name: RemoteController(name, ip='127.0.0.1', port=6633),
        switch=OVSSwitch,
        link=TCLink,
        autoSetMacs=True
    )

    info("\n=== Starting Network ===\n")

    net.start()

    info("\n=== Network Ready ===\n")

    CLI(net)

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