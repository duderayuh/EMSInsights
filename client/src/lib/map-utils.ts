// Chart and map initialization utilities
declare global {
  interface Window {
    Plotly: any;
    L: any;
    openCallDetails: (callId: number) => void;
  }
}

export function initializeCharts() {
  // Volume trend chart
  const volumeData = {
    x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    y: [45, 52, 48, 61, 58, 67, 43],
    type: 'scatter',
    mode: 'lines+markers',
    line: { color: '#2563eb' },
    marker: { color: '#2563eb' }
  };

  const volumeLayout = {
    margin: { t: 10, r: 10, b: 30, l: 40 },
    xaxis: { title: 'Day' },
    yaxis: { title: 'Calls' },
    showlegend: false,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent'
  };

  const volumeConfig = { displayModeBar: false, responsive: true };

  // Call types pie chart
  const typeData = [{
    values: [23, 18, 15, 12, 8, 24],
    labels: ['Medical', 'MVC', 'Fire', 'Overdose', 'Fall', 'Other'],
    type: 'pie',
    marker: {
      colors: ['#2563eb', '#f59e0b', '#dc2626', '#9333ea', '#16a34a', '#6b7280']
    }
  }];

  const typeLayout = {
    margin: { t: 10, r: 10, b: 10, l: 10 },
    showlegend: false,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent'
  };

  const typeConfig = { displayModeBar: false, responsive: true };

  // Response time chart
  const responseData = {
    x: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
    y: [4.2, 3.8, 5.1, 6.7, 7.2, 5.9],
    type: 'bar',
    marker: { color: '#16a34a' }
  };

  const responseLayout = {
    margin: { t: 10, r: 10, b: 40, l: 40 },
    xaxis: { title: 'Time' },
    yaxis: { title: 'Minutes' },
    showlegend: false,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent'
  };

  const responseConfig = { displayModeBar: false, responsive: true };

  // Load Plotly dynamically and create charts
  if (typeof window !== 'undefined' && !window.Plotly) {
    const script = document.createElement('script');
    script.src = 'https://cdn.plot.ly/plotly-latest.min.js';
    script.onload = () => {
      createCharts();
    };
    document.head.appendChild(script);
  } else if (window.Plotly) {
    createCharts();
  }

  function createCharts() {
    const volumeElement = document.getElementById('volumeChart');
    const typeElement = document.getElementById('typeChart');
    const responseElement = document.getElementById('responseChart');

    if (volumeElement && window.Plotly) {
      window.Plotly.newPlot(volumeElement, [volumeData], volumeLayout, volumeConfig);
    }

    if (typeElement && window.Plotly) {
      window.Plotly.newPlot(typeElement, typeData, typeLayout, typeConfig);
    }

    if (responseElement && window.Plotly) {
      window.Plotly.newPlot(responseElement, [responseData], responseLayout, responseConfig);
    }
  }
}

export function updateCharts(data: any) {
  if (typeof window !== 'undefined' && window.Plotly) {
    // Update charts with new data
    const volumeElement = document.getElementById('volumeChart');
    const typeElement = document.getElementById('typeChart');
    const responseElement = document.getElementById('responseChart');

    if (volumeElement && data.volumeData) {
      window.Plotly.restyle(volumeElement, { y: [data.volumeData] });
    }

    if (typeElement && data.typeData) {
      window.Plotly.restyle(typeElement, { values: [data.typeData.values] });
    }

    if (responseElement && data.responseData) {
      window.Plotly.restyle(responseElement, { y: [data.responseData] });
    }
  }
}

// Map functionality
let map: any = null;
let markersLayer: any = null;
let lastCalls: any[] = [];

// Handle page visibility changes to refresh map when tab becomes visible
function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && map) {
    console.log('Tab became visible, refreshing map...');
    // Force map to invalidate its size and redraw
    setTimeout(() => {
      if (map && typeof map.invalidateSize === 'function') {
        map.invalidateSize();
        console.log('Map size invalidated');
      }
      // Re-apply markers if we have cached calls
      if (lastCalls.length > 0) {
        updateMapMarkers(lastCalls);
      }
    }, 100);
  }
}

// Set up visibility change and window focus listeners once
if (typeof document !== 'undefined' && !(document as any).visibilityChangeListenerAdded) {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleVisibilityChange); // Also handle window focus
  (document as any).visibilityChangeListenerAdded = true;
}

export function initializeMap() {
  console.log('initializeMap called');
  if (typeof window === 'undefined') {
    console.log('Window undefined, skipping map init');
    return;
  }

  // Load Leaflet CSS and JS if not already loaded
  if (!document.getElementById('leaflet-css')) {
    console.log('Loading Leaflet CSS...');
    const css = document.createElement('link');
    css.id = 'leaflet-css';
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
  }

  if (!window.L) {
    console.log('Loading Leaflet JS...');
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      console.log('Leaflet JS loaded, creating map...');
      createMap();
    };
    script.onerror = () => {
      console.error('Failed to load Leaflet JS');
    };
    document.head.appendChild(script);
  } else {
    console.log('Leaflet already available, creating map...');
    createMap();
  }

  function createMap() {
    console.log('createMap called');
    const mapElement = document.getElementById('emergencyMap');
    console.log('Map element found:', !!mapElement);
    console.log('Map already exists:', !!map);
    
    if (!mapElement || map) {
      console.log('Map creation skipped - element missing or map exists');
      return;
    }

    console.log('Creating new map...');
    // Initialize map centered on Indianapolis
    map = window.L.map('emergencyMap').setView([39.7684, -86.1581], 11);
    console.log('Map created');

    // Add OpenStreetMap tiles
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    console.log('Tiles added');

    // Create layer group for markers
    markersLayer = window.L.layerGroup().addTo(map);
    console.log('Markers layer created');

    // Add Indianapolis boundary (approximate)
    const indianapolisBounds = [
      [39.6, -86.4],
      [39.9, -85.9]
    ];
    
    window.L.rectangle(indianapolisBounds, {
      color: '#2563eb',
      weight: 2,
      opacity: 0.3,
      fillOpacity: 0.1
    }).addTo(map);
    
    console.log('Map initialization complete');
  }
}

export function updateMapMarkers(calls: any[]) {
  console.log('updateMapMarkers called with calls:', calls);
  console.log('Map components status:', { map: !!map, markersLayer: !!markersLayer, leaflet: !!window.L });
  
  // Cache the calls for tab switching recovery
  lastCalls = calls;
  
  if (!map || !markersLayer || !window.L) {
    console.log('Map not ready for markers');
    return;
  }

  // Clear existing markers
  markersLayer.clearLayers();

  // Filter calls to only show last 24 hours
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const recentCalls = calls.filter(call => {
    const callTime = new Date(call.timestamp);
    return callTime >= twentyFourHoursAgo;
  });

  // Filter calls with coordinates
  const geocodedCalls = recentCalls.filter(call => call.latitude && call.longitude);
  console.log(`Found ${geocodedCalls.length} geocoded calls out of ${recentCalls.length} recent calls (last 24 hours)`);

  // Add markers for each call
  geocodedCalls.forEach(call => {
    console.log(`Adding marker for call ${call.id} at [${call.latitude}, ${call.longitude}]`);
    
    const markerColor = '#2563eb'; // Blue color for all emergency markers
    
    const marker = window.L.circleMarker([call.latitude, call.longitude], {
      radius: 8,
      fillColor: markerColor,
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    });

    // Add popup with call details
    const popupContent = `
      <div class="p-2">
        <div class="font-semibold text-sm mb-1">${call.callType || 'Unknown Type'}</div>
        <div class="text-xs text-gray-600 mb-1">${call.location || 'Location unknown'}</div>
        <div class="text-xs text-gray-500 mb-2">${new Date(call.timestamp).toLocaleTimeString()}</div>
        <button onclick="window.openCallDetails(${call.id})" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded">
          View Details
        </button>
      </div>
    `;
    
    marker.bindPopup(popupContent);
    marker.addTo(markersLayer);
    
    console.log(`Marker added successfully for call ${call.id}`);
  });

  console.log(`Total markers added: ${geocodedCalls.length}`);
}

// Function to force refresh map (useful for tab switching recovery)
export function refreshMap() {
  console.log('Forcing map refresh...');
  if (map && typeof map.invalidateSize === 'function') {
    // Force map to recalculate its size
    map.invalidateSize(true);
    console.log('Map size invalidated and refreshed');
    
    // Ensure map is visible and rendered
    setTimeout(() => {
      if (map) {
        // Force another invalidation to handle any remaining layout issues
        map.invalidateSize(true);
        
        // Re-apply markers if we have cached calls
        if (lastCalls.length > 0) {
          console.log('Restoring markers after refresh');
          updateMapMarkers(lastCalls);
        }
      }
    }, 200);
  } else if (!map) {
    // Map might have been destroyed, try to reinitialize
    console.log('Map not found, attempting reinitialize...');
    setTimeout(() => {
      initializeMap();
    }, 100);
  }
}


