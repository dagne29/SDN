#!/usr/bin/env python3

import collections

if not hasattr(collections, 'MutableMapping'):
    import collections.abc
    collections.MutableMapping = collections.abc.MutableMapping

from ryu.base import app_manager
from ryu.controller import ofp_event
from ryu.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER
from ryu.controller.handler import set_ev_cls
from ryu.ofproto import ofproto_v1_3
from ryu.lib.packet import packet, ethernet, ipv4, arp, icmp, tcp

from collections import defaultdict
import random
import time
import requests
from requests.exceptions import RequestException


class AdvancedSDNController(app_manager.RyuApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]

    def __init__(self, *args, **kwargs):
        super(AdvancedSDNController, self).__init__(*args, **kwargs)

        # MAC learning table
        self.mac_to_port = {}

        # Traffic counters
        self.ip_counter = defaultdict(int)
        self.tcp_syn_counter = defaultdict(int)

        # Blocked IPs
        self.blocked_ips = set()

        # Time tracking
        self.start_time = time.time()

    # =========================
    # 🚀 SWITCH SETUP
    # =========================
    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):

        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        # Table-miss flow
        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER,
                                          ofproto.OFPCML_NO_BUFFER)]

        self.add_flow(datapath, 0, match, actions)

        self.logger.info("✅ Switch connected")

    # =========================
    # ➕ ADD FLOW
    # =========================
    def add_flow(self, datapath, priority, match, actions):

        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS,
                                             actions)]

        mod = parser.OFPFlowMod(
            datapath=datapath,
            priority=priority,
            match=match,
            instructions=inst
        )

        datapath.send_msg(mod)

    # =========================
    # 🚨 BLOCK IP
    # =========================
    def block_ip(self, datapath, ip):

        if ip in self.blocked_ips:
            return

        parser = datapath.ofproto_parser

        match = parser.OFPMatch(eth_type=0x0800, ipv4_src=ip)

        # No actions = DROP
        self.add_flow(datapath, 100, match, [])

        self.blocked_ips.add(ip)

        self.logger.warning(f"🚨 BLOCKED ATTACKER: {ip}")

        # Send to dashboard (optional)
        try:
            requests.get(f"http://127.0.0.1:5000/alert/{ip}")
        except:
            pass

    # =========================
    # 🧠 DETECTION LOGIC
    # =========================
    def detect_attack(self, datapath, src_ip, pkt):

        # Increase counters
        self.ip_counter[src_ip] += 1

        # ICMP Flood Detection
        if pkt.get_protocol(icmp.icmp):
            if self.ip_counter[src_ip] > 100:
                self.logger.warning(f"⚠️ ICMP Flood detected: {src_ip}")
                self.block_ip(datapath, src_ip)

        # TCP SYN Flood Detection
        tcp_pkt = pkt.get_protocol(tcp.tcp)
        if tcp_pkt:
            if tcp_pkt.bits & tcp.TCP_SYN:
                self.tcp_syn_counter[src_ip] += 1

                if self.tcp_syn_counter[src_ip] > 100:
                    self.logger.warning(f"⚠️ SYN Flood detected: {src_ip}")
                    self.block_ip(datapath, src_ip)

        # Port Scan Detection (many packets quickly)
        if self.ip_counter[src_ip] > 100:
            self.logger.warning(f"⚠️ Port Scan detected: {src_ip}")
            self.block_ip(datapath, src_ip)

    # =========================
    # 📥 PACKET IN HANDLER
    # =========================
    @set_ev_cls(ofp_event.EventOFPPacketIn, MAIN_DISPATCHER)
    def packet_in_handler(self, ev):

        msg = ev.msg
        datapath = msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        dpid = datapath.id

        self.mac_to_port.setdefault(dpid, {})

        pkt = packet.Packet(msg.data)
        eth = pkt.get_protocol(ethernet.ethernet)

        if eth.ethertype == 0x88cc:
            return  # ignore LLDP

        dst = eth.dst
        src = eth.src

        in_port = msg.match['in_port']

        # Learn MAC
        self.mac_to_port[dpid][src] = in_port

        # Decide output port
        if dst in self.mac_to_port[dpid]:
            out_port = self.mac_to_port[dpid][dst]
        else:
            out_port = ofproto.OFPP_FLOOD

        actions = [parser.OFPActionOutput(out_port)]

        # =========================
        # 🔍 INSPECT IP PACKETS
        # =========================
        ip_pkt = pkt.get_protocol(ipv4.ipv4)

        if ip_pkt:
            src_ip = ip_pkt.src

            # If already blocked → drop
            if src_ip in self.blocked_ips:
                return

            # Run detection
            self.detect_attack(datapath, src_ip, pkt)

            # If ICMP packet, report to backend so dashboard gets flow/alert
            try:
                if pkt.get_protocol(icmp.icmp):
                    dst_ip = ip_pkt.dst

                    # try to map IP -> Mininet host id by querying backend topology
                    src_host = src_ip
                    dst_host = dst_ip
                    try:
                        resp = requests.get('http://127.0.0.1:5000/api/topology/hosts', timeout=1)
                        if resp.status_code == 200:
                            hosts = resp.json()  # dict of host_id -> data with 'ip'
                            for hid, hdata in hosts.items():
                                hip = hdata.get('ip', '')
                                if hip:
                                    hip_only = hip.split('/')[0]
                                    if hip_only == src_ip:
                                        src_host = hid
                                    if hip_only == dst_ip:
                                        dst_host = hid
                    except RequestException:
                        pass

                    # report to backend ping endpoint (this will register flow/alerts)
                    try:
                        requests.get(f'http://127.0.0.1:5000/api/mininet/ping/{src_host}/{dst_host}', timeout=1)
                    except RequestException:
                        pass

                    # publish a canonical ping event so Flask can store it and the dashboard can show it
                    try:
                        ping_payload = {
                            'src': src_host,
                            'dst': dst_host,
                            'src_host': src_host,
                            'dst_host': dst_host,
                            'src_ip': src_ip,
                            'dst_ip': dst_ip,
                            'protocol': 'ICMP,TCP,UDP',
                            'bytes': 64,
                            'packets': 1,
                            'latency_ms': round(random.uniform(1.0, 80.0), 3),
                            'status': 'success',
                            'command': f'ping {src_host} {dst_host}',
                            'origin': 'ryu',
                            'attack_detected': src_ip in self.blocked_ips,
                            'generated_alerts': [],
                        }
                        requests.post('http://127.0.0.1:5000/api/pings/ingest', json=ping_payload, timeout=1)
                    except RequestException:
                        pass

                    # also POST a richer controller report (flows + switches + attackers)
                    try:
                        flow_payload = [{
                            'id': f'CTRL-{int(time.time()*1000)}',
                            'src_host': src_host,
                            'src_ip': src_ip,
                            'dst_host': dst_host,
                            'dst_ip': dst_ip,
                            'protocol': 'ICMP,TCP,UDP',
                            'bytes': 64,
                            'packets': 1,
                            'latency_ms': round(random.uniform(1.0, 80.0), 3),
                        }]

                        # build a lightweight switches summary
                        switches_summary = {}
                        for dpid, mapping in self.mac_to_port.items():
                            switches_summary[str(dpid)] = {'ports': len(mapping)}

                        report = {
                            'flows': flow_payload,
                            'switches': switches_summary,
                            'port_stats': {},
                            'attackers': list(self.blocked_ips),
                        }

                        requests.post('http://127.0.0.1:5000/api/controller/report', json=report, timeout=1)
                    except RequestException:
                        pass
            except Exception:
                pass

        # =========================
        # ⚡ INSTALL FLOW
        # =========================
        if out_port != ofproto.OFPP_FLOOD:

            match = parser.OFPMatch(in_port=in_port,
                                   eth_dst=dst,
                                   eth_src=src)

            self.add_flow(datapath, 1, match, actions)

        # =========================
        # 📤 SEND PACKET
        # =========================
        out = parser.OFPPacketOut(
            datapath=datapath,
            buffer_id=msg.buffer_id,
            in_port=in_port,
            actions=actions,
            data=msg.data
        )

        datapath.send_msg(out)
