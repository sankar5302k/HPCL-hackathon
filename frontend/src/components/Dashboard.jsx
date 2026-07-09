import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  DollarSign, 
  Clock, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw 
} from 'lucide-react';

const API_BASE_URL = 'https://hpcl-hackathon-1.onrender.com/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [error, setError] = useState(null);

  // Filters state
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [compliance, setCompliance] = useState('');
  const [selectedRo, setSelectedRo] = useState('');
  const [regionalOffices, setRegionalOffices] = useState([]);
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalReports, setTotalReports] = useState(0);

  const [allReports, setAllReports] = useState([]);

  // Helper: parse TSV file format (UTF-16 encoding)
  const parseTSV = (text) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    
    const headers = lines[0].split('\t').map(h => h.trim());
    const records = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = line.split('\t');
      const record = {};
      
      headers.forEach((h, index) => {
        let val = cols[index] !== undefined ? cols[index].trim() : '';
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        }
        record[h] = val;
      });
      
      record['Outlet ID'] = parseInt(record['Outlet ID'], 10) || 0;
      record['Penality'] = parseFloat(record['Penality']) || 0.0;
      if (!record['Severity'] || record['Severity'] === 'nan') record['Severity'] = 'Others';
      if (!record['Original Compilance'] || record['Original Compilance'] === 'nan') record['Original Compilance'] = 'NC';
      if (!record['Current Compliance'] || record['Current Compliance'] === 'nan') record['Current Compliance'] = 'NC';
      
      records.push(record);
    }
    return records;
  };

  // Helper: compute stats locally
  const computeStats = (reportsList, selectedRo) => {
    let filtered = reportsList;
    if (selectedRo) {
      filtered = filtered.filter(r => r['Regional Office'] === selectedRo);
    }
    
    const total = filtered.length;
    if (total === 0) {
      return {
        total_reports: 0,
        severity_counts: {},
        compliance_counts: { original: {}, current: {} },
        total_penalties: 0.0,
        remedial_actions_pending: 0,
        regional_distribution: {},
        compliance_rate: 0.0
      };
    }
    
    const severity_counts = {};
    const orig_comp = {};
    const curr_comp = {};
    let total_penalties = 0.0;
    let pending_atr = 0;
    const regional_dist = {};
    const sales_area_dist = {};
    
    filtered.forEach(r => {
      const sev = String(r['Severity'] || 'Others').trim() || 'Others';
      severity_counts[sev] = (severity_counts[sev] || 0) + 1;
      
      const oc = String(r['Original Compilance'] || 'NC').trim() || 'NC';
      orig_comp[oc] = (orig_comp[oc] || 0) + 1;
      
      const cc = String(r['Current Compliance'] || 'NC').trim() || 'NC';
      curr_comp[cc] = (curr_comp[cc] || 0) + 1;
      
      total_penalties += parseFloat(r['Penality']) || 0.0;
      
      const isPendingAtr = (cc === 'NC' || !r['ATR'] || String(r['ATR']).trim() === '' || String(r['ATR']).trim().toLowerCase() === 'nan');
      if (isPendingAtr) {
        pending_atr += 1;
      }
      
      const ro = String(r['Regional Office'] || 'Unknown').trim() || 'Unknown';
      regional_dist[ro] = (regional_dist[ro] || 0) + 1;
      
      const sa = String(r['Sales Area'] || 'Unknown').trim() || 'Unknown';
      sales_area_dist[sa] = (sales_area_dist[sa] || 0) + 1;
    });
    
    const compliantCount = (curr_comp['C'] || 0) + (curr_comp['Compliant'] || 0);
    const compliance_rate = total > 0 ? parseFloat(((compliantCount / total) * 100).toFixed(2)) : 0.0;
    
    return {
      total_reports: total,
      severity_counts,
      compliance_counts: {
        original: orig_comp,
        current: curr_comp
      },
      total_penalties: parseFloat(total_penalties.toFixed(2)),
      remedial_actions_pending: pending_atr,
      regional_distribution: regional_dist,
      sales_area_distribution: sales_area_dist,
      compliance_rate
    };
  };

  // Helper: filter and paginate reports locally
  const getFilteredAndPaginatedReports = (reportsList) => {
    let filtered = reportsList;
    if (selectedRo) {
      filtered = filtered.filter(r => r['Regional Office'] === selectedRo);
    }
    if (severity) {
      filtered = filtered.filter(r => r['Severity'] === severity);
    }
    if (compliance) {
      filtered = filtered.filter(r => r['Current Compliance'] === compliance);
    }
    if (search) {
      const searchLower = search.toLowerCase().trim();
      filtered = filtered.filter(r => 
        (r['Outlet Name'] || '').toLowerCase().includes(searchLower) ||
        (r['Observation'] || '').toLowerCase().includes(searchLower) ||
        String(r['Outlet ID'] || '').includes(searchLower) ||
        (r['ATR'] || '').toLowerCase().includes(searchLower) ||
        (r['Remark'] || '').toLowerCase().includes(searchLower)
      );
    }
    
    const total = filtered.length;
    const limit = 8;
    const pages = Math.max(1, Math.ceil(total / limit));
    const startIdx = (page - 1) * limit;
    const paginated = filtered.slice(startIdx, startIdx + limit);
    
    return {
      data: paginated,
      total,
      pages
    };
  };

  // Load and parse TSV file directly in React
  const refreshData = () => {
    setLoadingStats(true);
    setLoadingReports(true);
    setError(null);
    fetch('/QA Reports - New - ATR Report (3).csv')
      .then(res => {
        if (!res.ok) throw new Error("Failed to load QA Reports CSV file");
        return res.arrayBuffer();
      })
      .then(buffer => {
        const decoder = new TextDecoder('utf-16');
        const csvText = decoder.decode(buffer);
        const parsed = parseTSV(csvText);
        setAllReports(parsed);
        
        // Populate regional offices
        const offices = [...new Set(parsed.map(r => r['Regional Office']).filter(Boolean))].sort();
        setRegionalOffices(offices);
      })
      .catch(err => {
        console.error(err);
        setError("Error loading Excel/CSV data directly in browser");
        setLoadingStats(false);
        setLoadingReports(false);
      });
  };

  useEffect(() => {
    refreshData();
  }, []);

  const fetchStats = () => {
    if (allReports.length === 0) return;
    setLoadingStats(true);
    const calculatedStats = computeStats(allReports, selectedRo);
    setStats(calculatedStats);
    setLoadingStats(false);
  };

  const fetchReports = () => {
    if (allReports.length === 0) return;
    setLoadingReports(true);
    const filteredResults = getFilteredAndPaginatedReports(allReports);
    setReports(filteredResults.data);
    setTotalPages(filteredResults.pages);
    setTotalReports(filteredResults.total);
    setLoadingReports(false);
  };

  useEffect(() => {
    fetchStats();
  }, [allReports, selectedRo]);

  useEffect(() => {
    fetchReports();
  }, [allReports, page, search, severity, compliance, selectedRo]);

  // Reset page when filters change
  const handleFilterChange = (filterType, value) => {
    setPage(1);
    if (filterType === 'search') setSearch(value);
    if (filterType === 'severity') setSeverity(value);
    if (filterType === 'compliance') setCompliance(value);
    if (filterType === 'ro') setSelectedRo(value);
  };

  // Custom SVG Donut Chart for Severity
  const renderSeverityDonut = () => {
    if (!stats || !stats.severity_counts) return null;
    const counts = stats.severity_counts;
    
    const data = [
      { name: 'Critical', value: counts['Critical'] || 0, color: '#ef4444' },
      { name: 'Major', value: counts['Major'] || 0, color: '#f59e0b' },
      { name: 'Minor', value: counts['Minor'] || 0, color: '#3b82f6' },
      { name: 'Others', value: counts['Others'] || counts['nan'] || 0, color: '#6b7280' },
    ].filter(d => d.value > 0);

    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return <div style={{ color: 'var(--text-secondary)' }}>No severity data</div>;

    let accumulatedPercentage = 0;
    const size = 180;
    const strokeWidth = 18;
    const center = size / 2;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <svg width={size} height={size}>
          <circle cx={center} cy={center} r={radius} fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth={strokeWidth} />
          {data.map((item, idx) => {
            const percentage = (item.value / total) * 100;
            const strokeDashoffset = circumference - (circumference * percentage) / 100;
            const angle = (accumulatedPercentage * 360) / 100 - 90;
            accumulatedPercentage += percentage;
            
            return (
              <circle
                key={idx}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform={`rotate(${angle} ${center} ${center})`}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            );
          })}
          <text x={center} y={center - 5} textAnchor="middle" fill="var(--text-primary)" style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-title)' }}>
            {total}
          </text>
          <text x={center} y={center + 15} textAnchor="middle" fill="var(--text-secondary)" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Obs
          </text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: item.color }} />
              <span style={{ color: 'var(--text-secondary)', width: '60px' }}>{item.name}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({roundPct(item.value, total)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Custom SVG Bar Chart for Compliance (Original vs Current)
  const renderComplianceChart = () => {
    if (!stats || !stats.compliance_counts) return null;
    const orig = stats.compliance_counts.original;
    const curr = stats.compliance_counts.current;

    const origC = orig['C'] || orig['Compliant'] || 0;
    const origNC = orig['NC'] || orig['Non-Compliant'] || 0;
    const currC = curr['C'] || curr['Compliant'] || 0;
    const currNC = curr['NC'] || curr['Non-Compliant'] || 0;

    const maxVal = Math.max(origC, origNC, currC, currNC, 10);
    const height = 180;
    const width = 280;
    const padding = 30;
    const chartHeight = height - padding * 2;
    const chartWidth = width - padding * 2;
    const barWidth = 35;

    const getBarHeight = (val) => (val / maxVal) * chartHeight;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width={width} height={height}>
          {/* Y Axis Grid lines */}
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
          <line x1={padding} y1={padding + chartHeight/2} x2={width - padding} y2={padding + chartHeight/2} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
          <line x1={padding} y1={padding + chartHeight} x2={width - padding} y2={padding + chartHeight} stroke="rgba(255,255,255,0.1)" />

          {/* Group 1: Original */}
          <rect 
            x={padding + 15} 
            y={padding + chartHeight - getBarHeight(origC)} 
            width={barWidth} 
            height={getBarHeight(origC)} 
            fill="rgba(16, 185, 129, 0.75)" 
            rx="4"
          />
          <rect 
            x={padding + 15 + barWidth + 4} 
            y={padding + chartHeight - getBarHeight(origNC)} 
            width={barWidth} 
            height={getBarHeight(origNC)} 
            fill="rgba(239, 68, 68, 0.75)" 
            rx="4"
          />
          
          {/* Group 2: Current */}
          <rect 
            x={padding + chartWidth - barWidth*2 - 19} 
            y={padding + chartHeight - getBarHeight(currC)} 
            width={barWidth} 
            height={getBarHeight(currC)} 
            fill="rgba(16, 185, 129, 0.95)" 
            rx="4"
            style={{ filter: 'drop-shadow(0 2px 6px rgba(16,185,129,0.3))' }}
          />
          <rect 
            x={padding + chartWidth - barWidth - 15} 
            y={padding + chartHeight - getBarHeight(currNC)} 
            width={barWidth} 
            height={getBarHeight(currNC)} 
            fill="rgba(239, 68, 68, 0.95)" 
            rx="4"
            style={{ filter: 'drop-shadow(0 2px 6px rgba(239,68,68,0.3))' }}
          />

          {/* Labels */}
          <text x={padding + 15 + barWidth} y={padding + chartHeight + 18} textAnchor="middle" fill="var(--text-secondary)" style={{ fontSize: '0.8rem', fontWeight: 500 }}>
            Original
          </text>
          <text x={padding + chartWidth - barWidth} y={padding + chartHeight + 18} textAnchor="middle" fill="var(--text-secondary)" style={{ fontSize: '0.8rem', fontWeight: 500 }}>
            Current (ATR)
          </text>

          {/* Value Labels on top of bars */}
          {getBarHeight(origC) > 15 && <text x={padding + 15 + barWidth/2} y={padding + chartHeight - getBarHeight(origC) - 4} textAnchor="middle" fill="#34d399" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{origC}</text>}
          {getBarHeight(origNC) > 15 && <text x={padding + 15 + barWidth + 4 + barWidth/2} y={padding + chartHeight - getBarHeight(origNC) - 4} textAnchor="middle" fill="#f87171" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{origNC}</text>}
          
          {getBarHeight(currC) > 15 && <text x={padding + chartWidth - barWidth*2 - 19 + barWidth/2} y={padding + chartHeight - getBarHeight(currC) - 4} textAnchor="middle" fill="#34d399" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{currC}</text>}
          {getBarHeight(currNC) > 15 && <text x={padding + chartWidth - barWidth - 15 + barWidth/2} y={padding + chartHeight - getBarHeight(currNC) - 4} textAnchor="middle" fill="#f87171" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{currNC}</text>}
        </svg>

        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-success)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Compliant (C)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-danger)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Non-Compliant (NC)</span>
          </div>
        </div>
      </div>
    );
  };

  // Custom SVG Horizontal Bar Chart for Regional Office distribution (Top 5)
  const renderRoChart = () => {
    if (!stats || !stats.regional_distribution) return null;
    const roDist = stats.regional_distribution;
    const data = Object.entries(roDist)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const maxVal = data[0]?.value || 1;
    const height = 180;
    const width = 360;
    const rowHeight = 28;
    const labelWidth = 110;
    const barMaxWidth = width - labelWidth - 40;

    return (
      <svg width={width} height={height}>
        {data.map((item, idx) => {
          const barWidth = (item.value / maxVal) * barMaxWidth;
          const y = idx * (rowHeight + 6) + 10;
          return (
            <g key={idx}>
              {/* RO Name */}
              <text 
                x={labelWidth} 
                y={y + 16} 
                textAnchor="end" 
                fill="var(--text-secondary)" 
                style={{ fontSize: '0.75rem', fontWeight: 500 }}
              >
                {item.name.replace(" RETAIL RO", "").replace(" RET RO", "")}
              </text>
              {/* Background Bar */}
              <rect 
                x={labelWidth + 10} 
                y={y} 
                width={barMaxWidth} 
                height={rowHeight - 6} 
                fill="rgba(255,255,255,0.02)" 
                rx="3"
              />
              {/* Value Bar */}
              <rect 
                x={labelWidth + 10} 
                y={y} 
                width={barWidth} 
                height={rowHeight - 6} 
                fill="url(#roBarGrad)"
                rx="3"
              />
              {/* Value Text */}
              <text 
                x={labelWidth + 15 + barWidth} 
                y={y + 15} 
                fill="var(--text-primary)" 
                style={{ fontSize: '0.75rem', fontWeight: 600 }}
              >
                {item.value}
              </text>
            </g>
          );
        })}
        {/* Gradients */}
        <defs>
          <linearGradient id="roBarGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.9" />
          </linearGradient>
        </defs>
      </svg>
    );
  };

  const roundPct = (value, total) => {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  };

  return (
    <div className="animate-fade-in">
      {/* Filters Header */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>QA Compliance Analytics Dashboard</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>National & regional QA inspection observation reports analysis</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Regional Office:</label>
          <select 
            className="select-input"
            value={selectedRo}
            onChange={(e) => handleFilterChange('ro', e.target.value)}
          >
            <option value="">All Regions</option>
            {regionalOffices.map((ro, idx) => (
              <option key={idx} value={ro}>{ro}</option>
            ))}
          </select>
          <button 
            className="pagination-btn"
            onClick={() => { refreshData(); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="dashboard-grid">
        <div className="glass-panel kpi-card">
          <div className="kpi-details">
            <h3>Total Observations</h3>
            <div className="kpi-value">
              {loadingStats ? <div className="spinner" style={{ width: '20px', height: '20px' }}></div> : stats?.total_reports}
            </div>
            <p className="kpi-trend success">QA Audited reports</p>
          </div>
          <div className="kpi-icon" style={{ color: 'var(--accent-primary)' }}>
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="glass-panel kpi-card">
          <div className="kpi-details">
            <h3>Compliance Rate</h3>
            <div className="kpi-value">
              {loadingStats ? <div className="spinner" style={{ width: '20px', height: '20px' }}></div> : `${stats?.compliance_rate}%`}
            </div>
            <p className="kpi-trend success">Currently Compliant</p>
          </div>
          <div className="kpi-icon" style={{ color: 'var(--accent-success)' }}>
            <CheckCircle size={24} />
          </div>
        </div>

        <div className="glass-panel kpi-card">
          <div className="kpi-details">
            <h3>Total Penalties</h3>
            <div className="kpi-value">
              {loadingStats ? <div className="spinner" style={{ width: '20px', height: '20px' }}></div> : `₹${stats?.total_penalties.toLocaleString('en-IN')}`}
            </div>
            <p className="kpi-trend danger">Penalties Issued</p>
          </div>
          <div className="kpi-icon" style={{ color: 'var(--accent-danger)' }}>
            <DollarSign size={24} />
          </div>
        </div>

        <div className="glass-panel kpi-card">
          <div className="kpi-details">
            <h3>Remedial Pending</h3>
            <div className="kpi-value">
              {loadingStats ? <div className="spinner" style={{ width: '20px', height: '20px' }}></div> : stats?.remedial_actions_pending}
            </div>
            <p className="kpi-trend warning">Requires ATR updates</p>
          </div>
          <div className="kpi-icon" style={{ color: 'var(--accent-warning)' }}>
            <Clock size={24} />
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="analytics-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="glass-panel chart-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 className="chart-title" style={{ width: '100%' }}>Compliance Resolution Progress</h3>
          {loadingStats ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner"></div>
            </div>
          ) : (
            renderComplianceChart()
          )}
        </div>

        <div className="glass-panel chart-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 className="chart-title" style={{ width: '100%' }}>Observation Severity</h3>
          {loadingStats ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner"></div>
            </div>
          ) : (
            renderSeverityDonut()
          )}
        </div>

        <div className="glass-panel chart-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 className="chart-title" style={{ width: '100%' }}>Top 5 Regions by Observations</h3>
          {loadingStats ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner"></div>
            </div>
          ) : (
            renderRoChart()
          )}
        </div>
      </div>

      {/* Reports Table */}
      <div className="glass-panel table-card">
        <div className="table-header">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>QA Observation Records ({totalReports})</h3>
          
          <div className="filters-wrapper">
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search name, obs, ATR..." 
                className="search-input" 
                style={{ paddingLeft: '32px' }}
                value={search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </div>

            {/* Severity Filter */}
            <select 
              className="select-input"
              value={severity}
              onChange={(e) => handleFilterChange('severity', e.target.value)}
            >
              <option value="">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="Major">Major</option>
              <option value="Minor">Minor</option>
              <option value="Others">Others</option>
            </select>

            {/* Compliance Filter */}
            <select 
              className="select-input"
              value={compliance}
              onChange={(e) => handleFilterChange('compliance', e.target.value)}
            >
              <option value="">All Compliance</option>
              <option value="C">Compliant (C)</option>
              <option value="NC">Non-Compliant (NC)</option>
            </select>
          </div>
        </div>

        {/* Table list */}
        {loadingReports ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <div className="spinner"></div>
          </div>
        ) : reports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            No QA records found matching filters.
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Outlet Name & ID</th>
                    <th>Region / Sales Area</th>
                    <th>Date</th>
                    <th>Severity</th>
                    <th style={{ width: '30%' }}>Observation & Remarks</th>
                    <th style={{ width: '25%' }}>Action Taken Report (ATR)</th>
                    <th>Compliance</th>
                    <th>Penalty</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report, idx) => (
                    <tr key={idx}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{report['Outlet Name']}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {report['Outlet ID']}</div>
                      </td>
                      <td>
                        <div>{report['Regional Office']}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{report['Sales Area']}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{report['Date'] || report['Inspection Month']}</td>
                      <td>
                        <span className={`badge ${
                          report['Severity'] === 'Critical' ? 'badge-danger' : 
                          report['Severity'] === 'Major' ? 'badge-warning' : 
                          report['Severity'] === 'Minor' ? 'badge-info' : 'badge-info'
                        }`}>
                          {report['Severity'] || 'Others'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', maxHeight: '60px', overflowY: 'auto' }}>
                          {report['Observation']}
                        </div>
                        {report['Remark'] && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                            Rem: {report['Remark']}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxHeight: '60px', overflowY: 'auto' }}>
                        {report['ATR'] || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Pending action report</span>}
                      </td>
                      <td>
                        <span className={`badge ${
                          report['Current Compliance'] === 'C' || report['Current Compliance'] === 'Compliant' ? 'badge-success' : 'badge-danger'
                        }`}>
                          {report['Current Compliance']}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: report['Penality'] > 0 ? 'var(--accent-danger)' : 'var(--text-secondary)' }}>
                        {report['Penality'] > 0 ? `₹${report['Penality'].toLocaleString('en-IN')}` : 'Nil'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            <div className="pagination">
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Showing page <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{totalPages}</strong> ({totalReports} records)
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="pagination-btn"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button 
                  className="pagination-btn"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
