# API Documentation

Base URL: `http://localhost:5000/api`

The active API is implemented in `backend/app.py`.

## Health

- `GET /health`

Example response:

```json
{
  "status": "healthy",
  "timestamp": "2026-04-17T12:00:00.000000"
}
```

## Dashboard

- `GET /dashboard`

Returns the combined payload used by the dashboard:

- `network_status`
- `network_load`
- `edge_status`
- `recent_traffic`
- `active_alerts`
- `system_health`

## Mininet

- `GET /mininet/status`
- `GET /mininet/connectivity`
- `GET /mininet/ping/<src>/<dst>`
- `GET /mininet/traffic/<src>/<dst>`

These endpoints simulate topology activity and generate flow or alert data for the UI.

## Controller

- `GET /controller/status`
- `GET /controller/switches`
- `GET /controller/flows`
- `GET /controller/statistics`

## Topology

- `GET /topology/graph`
- `GET /topology/devices`
- `GET /topology/statistics`
- `GET /topology/switches`
- `GET /topology/hosts`
- `GET /topology/links`
- `GET /topology/nodes`

`/topology/devices` and `/topology/graph` return the same combined topology payload.

## Traffic

- `GET /traffic/summary`
- `GET /traffic/stats`
- `GET /traffic/flows`
- `GET /traffic/top-flows?limit=10`
- `GET /traffic/protocols`
- `GET /traffic/bandwidth-trends`
- `GET /traffic/port-stats`

`/traffic/stats` and `/traffic/summary` return the same summary object.

## IDS

- `GET /ids/alerts?limit=50&severity=High`
- `PUT /ids/alerts/<alert_id>/acknowledge`
- `PUT /ids/alerts/<alert_id>/resolve`
- `GET /ids/statistics`
- `GET /ids/rules`

## Quick Checks

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/dashboard
curl http://localhost:5000/api/topology/graph
curl http://localhost:5000/api/traffic/summary
curl http://localhost:5000/api/ids/alerts
```
