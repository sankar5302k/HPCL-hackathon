import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import RoutePlanner from './components/RoutePlanner';
import InspectionAnalyser from './components/InspectionAnalyser';
import { BarChart3, Navigation, Compass, ScanLine } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="app-container">
      {/* Premium Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <Compass size={24} />
          </div>
          <div>
            <h1 className="brand-title">Optimized Route Planner</h1>
            <span style={{ fontSize: '0.65rem', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
              Inspection & QA Dashboard
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <BarChart3 size={16} />
            QA Analytics Dashboard
          </button>
          <button
            className={`nav-tab ${activeTab === 'planner' ? 'active' : ''}`}
            onClick={() => setActiveTab('planner')}
          >
            <Navigation size={16} />
            Route Optimizer
          </button>
          <button
            className={`nav-tab ${activeTab === 'analyser' ? 'active' : ''}`}
            onClick={() => setActiveTab('analyser')}
          >
            <ScanLine size={16} />
            Smart Inspection Analyser
          </button>
        </nav>

        {/* Status Indicator */}
        <div className="header-status">
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-success)', boxShadow: '0 0 8px #10b981' }}></span>
          <span>Bhopal Zone Active</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'planner'   && <RoutePlanner />}
        {activeTab === 'analyser'  && <InspectionAnalyser />}
      </main>
    </div>
  );
}
