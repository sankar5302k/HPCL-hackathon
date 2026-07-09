import React, { useState, useEffect, useRef } from 'react';
import MapComponent from './MapComponent';
import {
  Send,
  Sparkles,
  MapPin,
  Brain,
  HelpCircle,
  Compass,
  Navigation,
  ListTodo,
  FileDown,
  CalendarDays,
  ChevronDown,
  X
} from 'lucide-react';

const API_BASE_URL = 'https://hpcl-hackathon-1.onrender.com/api';

// Haversine Distance helper for frontend route construction
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── PDF Generator ────────────────────────────────────────────────────────────
function generateRoutePDF(route) {
  if (!route || route.length === 0) return;

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeStr = today.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const totalDistance = route.reduce((sum, s) => sum + (s.distance_from_prev_km || 0), 0);
  const totalTime    = route.reduce((sum, s) => sum + (s.travel_time_from_prev_hours || 0) + 1, 0); // +1h service per stop
  const neverCount   = route.filter(s => s.never_inspected).length;

  // Build table rows
  const rows = route.map((stop, i) => {
    const statusBadge = stop.never_inspected
      ? `<span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;">NEVER INSPECTED</span>`
      : `<span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;">ACTIVE</span>`;
    const prevDist = stop.distance_from_prev_km > 0
      ? `${stop.distance_from_prev_km} km`
      : `—`;
    const cumDist = stop.cumulative_distance_km
      ? `${stop.cumulative_distance_km} km`
      : `0 km`;
    const arrH = stop.arrival_time_hours;
    const depH = stop.departure_time_hours;
    const toHHMM = (h) => {
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    };
    const rowColor = i % 2 === 0 ? '#f9fafb' : '#ffffff';
    return `
      <tr style="background:${rowColor};">
        <td style="padding:8px 12px;text-align:center;font-weight:700;color:#1e40af;">${stop.stop_number}</td>
        <td style="padding:8px 12px;font-weight:600;color:#111827;">${stop.customer_name}</td>
        <td style="padding:8px 12px;color:#374151;">${stop.district}</td>
        <td style="padding:8px 12px;color:#374151;">${stop.sales_area || '—'}</td>
        <td style="padding:8px 12px;text-align:center;color:#374151;">${prevDist}</td>
        <td style="padding:8px 12px;text-align:center;font-weight:600;color:#1e40af;">${cumDist}</td>
        <td style="padding:8px 12px;text-align:center;color:#374151;">${toHHMM(arrH)}</td>
        <td style="padding:8px 12px;text-align:center;color:#374151;">${toHHMM(depH)}</td>
        <td style="padding:8px 12px;text-align:center;">${statusBadge}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Optimized Route Planner — Inspection Route Plan</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #ffffff;
      color: #111827;
      padding: 32px 40px;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px solid #1e40af;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .logo-block { display: flex; align-items: center; gap: 16px; }
    .logo-circle {
      width: 56px; height: 56px;
      background: linear-gradient(135deg, #1e40af, #3b82f6);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-weight: 900; font-size: 18px; letter-spacing: 1px;
    }
    .org-name  { font-size: 22px; font-weight: 800; color: #1e40af; }
    .org-sub   { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .doc-info  { text-align: right; }
    .doc-title { font-size: 16px; font-weight: 700; color: #111827; }
    .doc-date  { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .doc-ref   { font-size: 10px; color: #9ca3af; margin-top: 2px; }

    /* ── Summary Cards ── */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 28px;
    }
    .summary-card {
      background: linear-gradient(135deg, #eff6ff, #dbeafe);
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      padding: 14px 16px;
      text-align: center;
    }
    .summary-card .val { font-size: 26px; font-weight: 800; color: #1e40af; }
    .summary-card .lbl { font-size: 11px; color: #6b7280; margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

    /* ── Section title ── */
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #1e40af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #dbeafe;
    }

    /* ── Itinerary table ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 32px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    thead tr {
      background: linear-gradient(90deg, #1e40af, #2563eb);
      color: #ffffff;
    }
    thead th {
      padding: 10px 12px;
      text-align: left;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    thead th:nth-child(1),
    thead th:nth-child(5),
    thead th:nth-child(6),
    thead th:nth-child(7),
    thead th:nth-child(8),
    thead th:nth-child(9) { text-align: center; }
    tbody tr:last-child td { border-bottom: none; }
    tbody td { border-bottom: 1px solid #f3f4f6; }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid #e5e7eb;
      padding-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #9ca3af;
    }
    .footer-note { font-style: italic; }
    .footer-sign {
      text-align: right;
      font-size: 11px;
      color: #374151;
    }
    .footer-sign strong { display: block; margin-top: 24px; border-top: 1px solid #374151; padding-top: 4px; }

    /* ── Print styles ── */
    @media print {
      body { padding: 16px 20px; }
      @page { margin: 1.5cm; size: A4 landscape; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="logo-block">
      <div class="logo-circle">HPCL</div>
      <div>
        <div class="org-name">Hindustan Petroleum Corporation Ltd.</div>
        <div class="org-sub">Optimized Route Planner — Bhopal Zone Inspection Route Plan</div>
      </div>
    </div>
    <div class="doc-info">
      <div class="doc-title">Outlet Inspection Route Plan</div>
      <div class="doc-date">${dateStr} &nbsp;·&nbsp; ${timeStr}</div>
      <div class="doc-ref">Generated by Optimized Route Planner &nbsp;|&nbsp; Confidential</div>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="summary-grid">
    <div class="summary-card">
      <div class="val">${route.length}</div>
      <div class="lbl">Total Stops</div>
    </div>
    <div class="summary-card">
      <div class="val">${totalDistance.toFixed(1)} km</div>
      <div class="lbl">Total Distance</div>
    </div>
    <div class="summary-card">
      <div class="val">~${totalTime.toFixed(1)} h</div>
      <div class="lbl">Est. Total Time</div>
    </div>
    <div class="summary-card">
      <div class="val" style="color:#dc2626;">${neverCount}</div>
      <div class="lbl">Never Inspected</div>
    </div>
  </div>

  <!-- Itinerary Table -->
  <div class="section-title">Detailed Itinerary</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Station Name</th>
        <th>District</th>
        <th>Sales Area</th>
        <th>Leg Distance</th>
        <th>Cumulative</th>
        <th>Arrival</th>
        <th>Departure</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-note">
      ⚠ Distances calculated using Haversine formula (straight-line). Actual road distances may vary.<br/>
      ⏱ Service time: 1 hour per outlet. Travel speed assumed: 40 km/h.
    </div>
    <div class="footer-sign">
      Prepared by: ___________________________
      <strong>Authorized Signatory</strong>
    </div>
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────
function AIInsightsRenderer({ markdownText }) {
  if (!markdownText) return null;

  const cleanMarkdown = markdownText.replace(/```json[\s\S]*?```/g, '').trim();
  const lines = cleanMarkdown.split('\n');
  const elements = [];
  let inList = false;
  let listItems = [];

  const flushList = (key) => {
    if (listItems.length > 0) {
      elements.push(<ul key={`list-${key}`} style={{ marginLeft: '1.5rem', marginBottom: '0.75rem', listStyleType: 'disc' }}>{listItems}</ul>);
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('###')) {
      flushList(index);
      elements.push(<h4 key={index} style={{ fontSize: '1rem', fontWeight: 700, marginTop: '1rem', marginBottom: '0.4rem', color: '#60a5fa' }}>{trimmed.slice(3).trim()}</h4>);
    } else if (trimmed.startsWith('##')) {
      flushList(index);
      elements.push(<h3 key={index} style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '1.25rem', marginBottom: '0.5rem', color: '#93c5fd' }}>{trimmed.slice(2).trim()}</h3>);
    } else if (trimmed.startsWith('#')) {
      flushList(index);
      elements.push(<h2 key={index} style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '1.5rem', marginBottom: '0.75rem', color: '#ffffff' }}>{trimmed.slice(1).trim()}</h2>);
    } else if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
      inList = true;
      const content = parseInlineFormatting(trimmed.substring(1).trim());
      listItems.push(<li key={`li-${index}`} style={{ marginBottom: '0.3rem', color: 'var(--text-primary)', fontSize: '0.88rem' }}>{content}</li>);
    } else if (trimmed === '') {
      flushList(index);
    } else {
      flushList(index);
      const content = parseInlineFormatting(trimmed);
      elements.push(<p key={index} style={{ marginBottom: '0.75rem', color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: '1.5' }}>{content}</p>);
    }
  });

  flushList(lines.length);
  return <div className="insights-content">{elements}</div>;
}

function parseInlineFormatting(text) {
  if (!text) return '';
  const parts = [];
  let currentIndex = 0;
  const boldRegex = /\*\*(.*?)\*\*/g;
  let match;
  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > currentIndex) parts.push(text.substring(currentIndex, match.index));
    parts.push(<strong key={match.index} style={{ color: '#fff', fontWeight: 700 }}>{match[1]}</strong>);
    currentIndex = boldRegex.lastIndex;
  }
  if (currentIndex < text.length) parts.push(text.substring(currentIndex));
  return parts.length > 0 ? parts : text;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RoutePlanner() {
  const [outlets, setOutlets] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [route, setRoute] = useState([]);
  const [startCoords, setStartCoords] = useState({ lat: 23.259933, lon: 77.412613 });

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "### Welcome to Optimized Route Planner AI Chatbot!\n\nI have full memory of the **165 outlets in the Bhopal Zone** and the QA observation logs.\n\nAsk me questions like:\n- *\"Suggest a 4-stop route starting from HSD UNITED SALES and visiting never-inspected outlets.\"*\n- *\"Which outlets in Sagar have a long inspection gap?\"*\n- *\"Show me a list of QA observation issues for Bhopal RET RO.\"*\n\nIf I plan a route for you, I'll return a structured plan and **automatically draw the route on the map!**"
    }
  ]);
  const [input, setInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);

  // ── Planner Mode State ──
  const [plannerMode, setPlannerMode] = useState(false);
  const [planDays, setPlanDays] = useState('1');
  const [planPriority, setPlanPriority] = useState('never_inspected');
  const [planDistrict, setPlanDistrict] = useState('');
  const [planStart, setPlanStart] = useState('');

  // Unique districts from outlets
  const districts = [...new Set(outlets.map(o => o.District).filter(Boolean))].sort();

  const buildPlannerPrompt = () => {
    const days = parseInt(planDays);
    const priorityLabel = planPriority === 'never_inspected'
      ? 'outlets that have NEVER been inspected (Outlets Never Inspected = true)'
      : planPriority === 'long_gap'
      ? 'outlets with the longest inspection gap (Inspection Gap > 3 years)'
      : 'all outlets regardless of inspection status';
    const districtClause = planDistrict ? `Focus exclusively on the ${planDistrict} district.` : 'Spread across districts to cover the Bhopal Zone efficiently.';
    const startClause = planStart ? `Start the route from outlet named "${planStart}".` : 'Choose the best starting outlet based on geography.';

    return (
      `Generate a COMPLETE ${days}-day outlet inspection route plan for the Bhopal Zone. ` +
      `Each day should have 4-6 stops optimised by proximity. ` +
      `Prioritise ${priorityLabel}. ` +
      `${districtClause} ${startClause} ` +
      `For EACH stop include: outlet name, district, distance from previous stop, and reason for inclusion. ` +
      `At the end of your full response, output ONE combined route_plan JSON block containing ALL stops across all days in visit order.`
    );
  };

  const messagesEndRef = useRef(null);

  const suggestions = [
    "Plan a 4-stop route from HSD UNITED SALES",
    "Show outlets never inspected in Sagar",
    "List critical QA issues in Bhopal regional office",
    "Which outlets have the longest inspection gap?"
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingChat]);

  useEffect(() => {
    setLoadingData(true);
    fetch(`${API_BASE_URL}/outlets`)
      .then(res => res.json())
      .then(data => { setOutlets(data); setLoadingData(false); })
      .catch(err => { console.error("Error fetching outlets:", err); setLoadingData(false); });
  }, []);

  // Parse structured route JSON from Gemini response
  const detectAndRenderRoute = (text) => {
    try {
      // Strategy 1: look for ```json ... ``` fences (most common)
      const fenceRegex = /```json[\s\S]*?(\{[\s\S]*?"route_plan"[\s\S]*?\})[\s\S]*?```/i;
      const fenceMatch = text.match(fenceRegex);
      if (fenceMatch) {
        console.log('[RouteGuard] Found fenced JSON, parsing...');
        parseRouteData(fenceMatch[1]);
        return;
      }

      // Strategy 2: scan for any raw JSON object containing type:route_plan
      const rawStart = text.indexOf('"route_plan"');
      if (rawStart !== -1) {
        // Walk back to find the opening brace
        const before = text.lastIndexOf('{', rawStart);
        if (before !== -1) {
          // Find matching closing brace
          let depth = 0;
          let end = before;
          for (let i = before; i < text.length; i++) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
          }
          const candidate = text.slice(before, end + 1);
          console.log('[RouteGuard] Found raw JSON candidate:', candidate);
          parseRouteData(candidate);
          return;
        }
      }

      console.warn('[RouteGuard] No route_plan JSON found in response.');
    } catch (e) {
      console.error('[RouteGuard] Failed to extract JSON from response:', e);
    }
  };

  const roundVal = (val) => Math.round(val * 100) / 100;

  const parseRouteData = (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      console.log('[RouteGuard] Parsed route data:', data);
      if (data.type === 'route_plan' && Array.isArray(data.route)) {
        const outletIds = data.route;
        console.log('[RouteGuard] Route outlet IDs:', outletIds);
        console.log('[RouteGuard] Total outlets loaded:', outlets.length);
        const reconstructedStops = [];
        let accumulatedDistance = 0;
        let accumulatedTime = 0;
        const speed = 40.0;
        const serviceTime = 1.0;
        let prevLat = null;
        let prevLon = null;

        outletIds.forEach((id, index) => {
          // Coerce both sides to Number for reliable comparison
          const numId = Number(id);
          const outlet = outlets.find(o => Number(o['Customer Number']) === numId);
          if (!outlet) {
            console.warn(`[RouteGuard] Outlet ID ${id} not found in loaded outlets.`);
            return;
          }
          console.log(`[RouteGuard] Stop ${index + 1}: ${outlet['Customer Name']} (${outlet.LAT}, ${outlet.LON})`);

          let dist = 0;
          if (prevLat !== null && prevLon !== null) {
            dist = haversineDistance(prevLat, prevLon, outlet.LAT, outlet.LON);
          } else {
            setStartCoords({ lat: outlet.LAT, lon: outlet.LON });
          }

          accumulatedDistance += dist;
          const travelTime = dist > 0 ? dist / speed : 0;
          const arrival = accumulatedTime + travelTime;
          const departure = arrival + serviceTime;
          accumulatedTime = departure;

          reconstructedStops.push({
            stop_number: index + 1,
            customer_number: outlet['Customer Number'],
            customer_name: outlet['Customer Name'],
            district: outlet['District'],
            lat: outlet.LAT,
            lon: outlet.LON,
            inspection_gap_years: outlet['Inspection Gap (Years)'],
            never_inspected: outlet['Outlets Never Inspected'],
            regional_office: outlet['Regional Office'],
            sales_area: outlet['Sales Area'],
            distance_from_prev_km: roundVal(dist),
            cumulative_distance_km: roundVal(accumulatedDistance),
            travel_time_from_prev_hours: roundVal(travelTime),
            arrival_time_hours: roundVal(arrival),
            departure_time_hours: roundVal(departure)
          });

          prevLat = outlet.LAT;
          prevLon = outlet.LON;
        });

        if (reconstructedStops.length > 0) setRoute(reconstructedStops);
      }
    } catch (err) {
      console.error("Error parsing route json object:", err);
    }
  };

  const handleSend = (textToSend) => {
    const queryText = textToSend || input;
    if (!queryText.trim()) return;

    const updatedMessages = [...messages, { role: 'user', content: queryText }];
    setMessages(updatedMessages);
    setInput('');
    setLoadingChat(true);

    fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: updatedMessages })
    })
      .then(res => { if (!res.ok) throw new Error("Server communication error"); return res.json(); })
      .then(data => {
        const reply = data.response;
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        detectAndRenderRoute(reply);
        setLoadingChat(false);
      })
      .catch(err => {
        console.error(err);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "### System Error\n\nUnable to reach the backend AI server. Please make sure the FastAPI server is running on port 8000."
        }]);
        setLoadingChat(false);
      });
  };

  // Total distance for summary
  const totalRouteDist = route.reduce((sum, s) => sum + (s.distance_from_prev_km || 0), 0);

  return (
    <div className="planner-layout animate-fade-in">
      {/* ── Left Chatbot Window ── */}
      <div className="glass-panel chat-container" style={{ overflow: 'hidden' }}>
        {/* Chat Header */}
        <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Brain size={20} style={{ color: 'var(--accent-purple)' }} />
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>AI Planner Copilot</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Bhopal zone memory active</p>
            </div>
          </div>
          {/* Planner Mode Toggle */}
          <button
            onClick={() => setPlannerMode(p => !p)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              background: plannerMode
                ? 'linear-gradient(135deg, #7c3aed, #4f46e5)'
                : 'rgba(124,58,237,0.12)',
              color: plannerMode ? '#fff' : '#a78bfa',
              border: '1px solid rgba(124,58,237,0.3)',
              borderRadius: '8px',
              padding: '5px 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <CalendarDays size={13} />
            Planner Mode
          </button>
        </div>

        {/* ── Planner Mode Form ── */}
        {plannerMode && (
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(124,58,237,0.06)',
            display: 'flex', flexDirection: 'column', gap: '0.65rem'
          }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Configure Route Plan
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {/* Days */}
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Days</label>
                <select className="select-input" style={{ width: '100%', minWidth: 'unset' }} value={planDays} onChange={e => setPlanDays(e.target.value)}>
                  {['1','2','3','4','5'].map(d => <option key={d} value={d}>{d} Day{d > 1 ? 's' : ''}</option>)}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Priority</label>
                <select className="select-input" style={{ width: '100%', minWidth: 'unset' }} value={planPriority} onChange={e => setPlanPriority(e.target.value)}>
                  <option value="never_inspected">Never Inspected</option>
                  <option value="long_gap">Longest Gap</option>
                  <option value="all">All Outlets</option>
                </select>
              </div>

              {/* District */}
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>District (optional)</label>
                <select className="select-input" style={{ width: '100%', minWidth: 'unset' }} value={planDistrict} onChange={e => setPlanDistrict(e.target.value)}>
                  <option value="">All Districts</option>
                  {districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Starting Outlet */}
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Start Outlet (optional)</label>
                <select className="select-input" style={{ width: '100%', minWidth: 'unset' }} value={planStart} onChange={e => setPlanStart(e.target.value)}>
                  <option value="">AI Chooses Best</option>
                  {outlets.slice(0, 50).map(o => <option key={o['Customer Number']} value={o['Customer Name']}>{o['Customer Name']}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                const prompt = buildPlannerPrompt();
                setPlannerMode(false);
                handleSend(prompt);
              }}
              disabled={loadingChat}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: '#fff', border: 'none', borderRadius: '8px',
                padding: '8px 0', fontSize: '0.82rem', fontWeight: 700,
                cursor: 'pointer', width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                boxShadow: '0 2px 12px rgba(124,58,237,0.4)'
              }}
            >
              <Navigation size={14} />
              Generate {planDays}-Day Route Plan
            </button>
          </div>
        )}

        {/* Conversation List */}
        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}>
              <AIInsightsRenderer markdownText={msg.content} />
            </div>
          ))}

          {loadingChat && (
            <div className="chat-bubble assistant" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="spinner" style={{ width: '14px', height: '14px', borderLeftColor: 'var(--accent-purple)' }}></div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>AI is thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion Chips */}
        {!loadingChat && messages.length < 5 && (
          <div className="suggestion-chips">
            {suggestions.map((s, idx) => (
              <button key={idx} className="suggestion-chip" onClick={() => handleSend(s)}>{s}</button>
            ))}
          </div>
        )}

        {/* Chat Input */}
        <div className="chat-input-area">
          <input
            type="text"
            placeholder="Ask AI to plan a route, query gaps..."
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loadingChat || loadingData}
          />
          <button
            className="chat-send-btn"
            onClick={() => handleSend()}
            disabled={loadingChat || loadingData || !input.trim()}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* ── Right: Map + Itinerary ── */}
      <div className="planner-content" style={{ gridTemplateRows: '1fr 220px' }}>
        {/* Map */}
        <div style={{ position: 'relative', height: '100%' }}>
          <MapComponent outlets={outlets} route={route} startCoords={startCoords} />
        </div>

        {/* Active Route Itinerary Panel */}
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Navigation size={16} style={{ color: 'var(--accent-primary)' }} />
              Active Route&nbsp;
              <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                ({route.length} stops
                {route.length > 0 && ` · ${totalRouteDist.toFixed(1)} km total`})
              </span>
            </h3>

            {/* PDF Export Button — only visible when route is loaded */}
            {route.length > 0 && (
              <button
                onClick={() => generateRoutePDF(route)}
                title="Download Route Plan as PDF"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(59,130,246,0.4)',
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <FileDown size={14} />
                Export PDF
              </button>
            )}
          </div>

          {route.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80px', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center' }}>
              No active route loaded. Ask the AI Chatbot to plan a route to render the itinerary and draw the path on the map.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {route.map((stop, idx) => (
                <div key={idx} style={{
                  flexShrink: 0,
                  width: '210px',
                  background: 'rgba(255,255,255,0.04)',
                  border: stop.never_inspected
                    ? '1px solid rgba(239,68,68,0.4)'
                    : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'flex-start',
                  position: 'relative'
                }}>
                  {/* Stop Number Badge */}
                  <div style={{
                    background: 'var(--accent-primary)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    marginTop: '2px',
                    flexShrink: 0
                  }}>
                    {stop.stop_number}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Name */}
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {stop.customer_name}
                    </div>

                    {/* District + Never Inspected badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{stop.district}</span>
                      {stop.never_inspected && (
                        <span style={{
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          background: 'rgba(239,68,68,0.2)',
                          color: '#f87171',
                          border: '1px solid rgba(239,68,68,0.4)',
                          borderRadius: '4px',
                          padding: '1px 5px',
                          letterSpacing: '0.3px'
                        }}>NEW</span>
                      )}
                    </div>

                    {/* Distance row */}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {idx === 0
                        ? <span style={{ color: '#34d399' }}>▶ Start</span>
                        : <span>+{stop.distance_from_prev_km} km leg</span>
                      }
                      <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                        Σ {stop.cumulative_distance_km} km
                      </span>
                    </div>

                    {/* Arrival / Departure */}
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                      {(() => {
                        const toHH = (h) => {
                          const hh = Math.floor(h);
                          const mm = Math.round((h - hh) * 60);
                          return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
                        };
                        return `Arr ${toHH(stop.arrival_time_hours)} · Dep ${toHH(stop.departure_time_hours)}`;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
