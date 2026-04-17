# Backend Setup Guide

The active backend is a single Flask application in `backend/app.py`.

## Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

The API starts on `http://localhost:5000`.

## What The Backend Provides

- simulated controller and Mininet status
- topology data for hosts, switches, and links
- traffic generation and recent flow history
- IDS alerts and rule statistics

## Main Endpoints

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/mininet/status`
- `GET /api/mininet/connectivity`
- `GET /api/mininet/ping/<src>/<dst>`
- `GET /api/mininet/traffic/<src>/<dst>`
- `GET /api/controller/status`
- `GET /api/controller/switches`
- `GET /api/controller/flows`
- `GET /api/controller/statistics`
- `GET /api/topology/graph`
- `GET /api/topology/devices`
- `GET /api/topology/statistics`
- `GET /api/topology/switches`
- `GET /api/topology/hosts`
- `GET /api/topology/links`
- `GET /api/topology/nodes`
- `GET /api/traffic/summary`
- `GET /api/traffic/stats`
- `GET /api/traffic/flows`
- `GET /api/traffic/top-flows`
- `GET /api/traffic/protocols`
- `GET /api/traffic/bandwidth-trends`
- `GET /api/traffic/port-stats`
- `GET /api/ids/alerts`
- `PUT /api/ids/alerts/<alert_id>/acknowledge`
- `PUT /api/ids/alerts/<alert_id>/resolve`
- `GET /api/ids/statistics`
- `GET /api/ids/rules`

## Quick Checks

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/dashboard
curl http://localhost:5000/api/topology/graph
curl http://localhost:5000/api/ids/alerts
```
