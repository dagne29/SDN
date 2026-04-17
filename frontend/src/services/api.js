import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

// Create axios instance with base URL
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Controller API
export const controllerAPI = {
  getStatus: () => apiClient.get('/controller/status'),
  getSwitches: () => apiClient.get('/controller/switches'),
  getFlows: () => apiClient.get('/controller/flows'),
  getStatistics: () => apiClient.get('/controller/statistics'),
};

// Topology API
export const topologyAPI = {
  getGraph: () => apiClient.get('/topology/graph'),
  getStatistics: () => apiClient.get('/topology/statistics'),
  getSwitches: () => apiClient.get('/topology/switches'),
  getHosts: () => apiClient.get('/topology/hosts'),
  getLinks: () => apiClient.get('/topology/links'),
  getNodes: () => apiClient.get('/topology/nodes'),
  getDevices: () => apiClient.get('/topology/devices'),
};

// Traffic API
export const trafficAPI = {
  getSummary: () => apiClient.get('/traffic/summary'),
  getFlows: () => apiClient.get('/traffic/flows'),
  getTopFlows: (limit = 10) => apiClient.get(`/traffic/top-flows?limit=${limit}`),
  getProtocols: () => apiClient.get('/traffic/protocols'),
  getBandwidthTrends: (interval = 12) => apiClient.get(`/traffic/bandwidth-trends?interval=${interval}`),
  getPortStats: () => apiClient.get('/traffic/port-stats'),
  getStats: () => apiClient.get('/traffic/stats'),
  runTrafficTest: (src, dst) => apiClient.get(`/mininet/traffic/${src}/${dst}`),
  runPingTest: (src, dst) => apiClient.get(`/mininet/ping/${src}/${dst}`),
};

// IDS API
export const idsAPI = {
  getAlerts: (limit = 50, severity = null) => {
    let url = `/ids/alerts?limit=${limit}`;
    if (severity) url += `&severity=${severity}`;
    return apiClient.get(url);
  },
  acknowledgeAlert: (alertId) => apiClient.put(`/ids/alerts/${alertId}/acknowledge`),
  resolveAlert: (alertId) => apiClient.put(`/ids/alerts/${alertId}/resolve`),
  getStatistics: () => apiClient.get('/ids/statistics'),
  getRules: () => apiClient.get('/ids/rules'),
};

export const dashboardAPI = {
  getOverview: () => apiClient.get('/dashboard'),
};

export const mininetAPI = {
  getStatus: () => apiClient.get('/mininet/status'),
  getConnectivity: () => apiClient.get('/mininet/connectivity'),
};

export default apiClient;
