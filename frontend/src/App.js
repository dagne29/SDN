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
            <Route path="/controller" element={<Controller />} />
            <Route path="/controller/flows" element={<ControllerFlows />} />
            <Route path="/traffic" element={<TrafficAnalysis />} />
            <Route path="/alerts" element={<IDSAlerts />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
