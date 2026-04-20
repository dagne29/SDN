import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Topology from './components/Topology';
import TrafficAnalysis from './components/TrafficAnalysis';
import IDSAlerts from './components/IDSAlerts';
import Controller from './components/Controller';
import ControllerFlows from './components/ControllerFlows';
import FlowDetail from './components/FlowDetail';
import AlertDetail from './components/AlertDetail';
import HostDetail from './components/HostDetail';
import Navigation from './components/Navigation';

function App() {
  return (
    <Router>
      <div className="App app-shell">
        <Navigation />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/topology" element={<Topology />} />
            <Route path="/controller/*" element={<Controller />} />
            <Route path="/controller/flows" element={<ControllerFlows />} />
            <Route path="/flows/:flowId" element={<FlowDetail />} />
            <Route path="/traffic/*" element={<TrafficAnalysis />} />
            <Route path="/alerts" element={<IDSAlerts />} />
            <Route path="/alerts/:alertId" element={<AlertDetail />} />
            <Route path="/hosts/:hostId" element={<HostDetail />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
