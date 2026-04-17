import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Topology from './components/Topology';
import TrafficAnalysis from './components/TrafficAnalysis';
import IDSAlerts from './components/IDSAlerts';
import Controller from './components/Controller';
import Navigation from './components/Navigation';

function App() {
  return (
    <Router>
      <div className="App">
        <Navigation />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/topology" element={<Topology />} />
          <Route path="/controller" element={<Controller />} />
          <Route path="/traffic" element={<TrafficAnalysis />} />
          <Route path="/alerts" element={<IDSAlerts />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
