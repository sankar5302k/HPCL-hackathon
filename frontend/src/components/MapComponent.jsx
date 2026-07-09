import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function MapComponent({ outlets, route, startCoords }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const routeLayerRef = useRef(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Create map centered in Bhopal
    const initialCenter = startCoords ? [startCoords.lat, startCoords.lon] : [23.259933, 77.412613];
    const initialZoom = startCoords ? 11 : 9;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: false
    });

    // Dark-themed tiles from CartoDB (perfect for our premium dark dashboard!)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    mapRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);

    // Add scale control
    L.control.scale({ position: 'bottomright' }).addTo(map);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update starting coordinates if they change
  useEffect(() => {
    if (!mapRef.current || !startCoords) return;
    mapRef.current.setView([startCoords.lat, startCoords.lon], 11);
  }, [startCoords]);

  // Update All Outlets Markers
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current || !outlets) return;

    // Clear previous markers
    markersLayerRef.current.clearLayers();

    outlets.forEach(outlet => {
      const lat = outlet.LAT;
      const lon = outlet.LON;

      if (!lat || !lon) return;

      const isNeverInspected = outlet['Outlets Never Inspected'];
      const gap = outlet['Inspection Gap (Years)'];
      
      // Determine colors based on status
      let color = '#3b82f6'; // Blue for standard
      let radius = 6;
      let fillOpacity = 0.6;
      
      if (isNeverInspected) {
        color = '#ef4444'; // Red for Never Inspected (Critical!)
        radius = 8;
        fillOpacity = 0.8;
      } else if (gap && gap > 3) {
        color = '#f59e0b'; // Amber for long gap (High Priority)
        radius = 7;
        fillOpacity = 0.7;
      }

      const marker = L.circleMarker([lat, lon], {
        radius: radius,
        fillColor: color,
        color: '#ffffff',
        weight: 1,
        opacity: 0.8,
        fillOpacity: fillOpacity
      });

      // Bind rich popup information
      const popupContent = `
        <div style="font-family: var(--font-body); color: #111; font-size: 0.85rem; padding: 4px;">
          <h4 style="margin: 0 0 6px 0; font-size: 0.95rem; font-weight: 700; color: #1f2937;">
            ${outlet['Customer Name']}
          </h4>
          <div style="margin-bottom: 4px;"><strong>ID:</strong> ${outlet['Customer Number']}</div>
          <div style="margin-bottom: 4px;"><strong>District:</strong> ${outlet['District']}</div>
          <div style="margin-bottom: 4px;"><strong>Sales Area:</strong> ${outlet['Sales Area']}</div>
          <div style="margin-bottom: 4px;"><strong>Last Inspected:</strong> ${outlet['Last Inspection Date'] || 'N/A'}</div>
          ${gap ? `<div style="margin-bottom: 4px;"><strong>Inspection Gap:</strong> ${gap} years</div>` : ''}
          <div style="margin-top: 8px;">
            ${isNeverInspected 
              ? `<span style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">NEVER INSPECTED</span>`
              : `<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">ACTIVE</span>`
            }
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      markersLayerRef.current.addLayer(marker);
    });
  }, [outlets]);

  // Update Route Layers (Route Markers & Connected Polyline)
  useEffect(() => {
    if (!mapRef.current || !routeLayerRef.current) return;

    // Clear previous route elements
    routeLayerRef.current.clearLayers();

    if (!route || route.length === 0) return;

    const latlngs = [];

    // Add Start Location Marker if we have route data
    if (startCoords) {
      const startMarker = L.circleMarker([startCoords.lat, startCoords.lon], {
        radius: 9,
        fillColor: '#10b981', // Emerald green for start
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      });
      startMarker.bindPopup(`
        <div style="color: #111; font-family: var(--font-body); padding: 4px;">
          <strong>Start Inspection Base</strong><br/>
          Coords: ${startCoords.lat.toFixed(6)}, ${startCoords.lon.toFixed(6)}
        </div>
      `);
      routeLayerRef.current.addLayer(startMarker);
      latlngs.push([startCoords.lat, startCoords.lon]);
    }

    // Add Route Stops
    route.forEach((stop, index) => {
      const stopLatLng = [stop.lat, stop.lon];
      latlngs.push(stopLatLng);

      // Create a glowing numbered circle for route order
      const numberIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div style="
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            font-weight: 700;
            border: 2px solid white;
            box-shadow: 0 0 10px rgba(59,130,246,0.6);
            transform: translate(-4px, -4px);
          ">
            ${index + 1}
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker(stopLatLng, { icon: numberIcon });
      
      const popupContent = `
        <div style="font-family: var(--font-body); color: #111; font-size: 0.85rem; padding: 4px;">
          <div style="font-weight: 700; font-size: 0.75rem; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">
            Stop ${index + 1} of ${route.length}
          </div>
          <h4 style="margin: 0 0 6px 0; font-size: 0.95rem; font-weight: 700; color: #1f2937;">
            ${stop.customer_name}
          </h4>
          <div style="margin-bottom: 2px;"><strong>District:</strong> ${stop.district}</div>
          <div style="margin-bottom: 2px;"><strong>Travel Dist:</strong> ${stop.distance_from_prev_km} km</div>
          <div style="margin-bottom: 2px;"><strong>Arrival:</strong> ${stop.arrival_time_hours} hrs</div>
          <div style="margin-bottom: 2px;"><strong>Departure:</strong> ${stop.departure_time_hours} hrs</div>
          <div style="margin-top: 6px;">
            ${stop.never_inspected 
              ? `<span style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:0.70rem;font-weight:700;">NEVER INSPECTED</span>` 
              : ''
            }
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      routeLayerRef.current.addLayer(marker);
    });

    // Draw the connection path polyline
    if (latlngs.length > 1) {
      const polyline = L.polyline(latlngs, {
        color: '#60a5fa', // Soft blue line
        weight: 4,
        opacity: 0.8,
        dashArray: '5, 8', // dashed style for path direction
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(routeLayerRef.current);

      // Fit map bounds to show entire route
      const bounds = L.latLngBounds(latlngs);
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [route, startCoords]);

  return <div ref={mapContainerRef} className="map-container-wrapper" />;
}
