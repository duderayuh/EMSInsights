import { useEffect, useRef, useState } from "react";
import { Call } from "@shared/schema";
import { Building, Cloud, Plane, Eye, EyeOff, MapPin } from "lucide-react";

interface GoogleMapViewProps {
  calls: Call[];
  onCallSelect?: (call: Call) => void;
}

declare global {
  interface Window {
    google: any;
    initGoogleMap: () => void;
  }
}

// Hospital overlay functionality completely removed

function GoogleMapView({ calls, onCallSelect }: GoogleMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersMapRef = useRef<Map<number, any>>(new Map()); // Track markers by call ID
  const aircraftMarkersRef = useRef<any[]>([]);
  const weatherOverlaysRef = useRef<any[]>([]);
  const radarUpdateInterval = useRef<NodeJS.Timeout | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [weatherOverlayEnabled, setWeatherOverlayEnabled] = useState(false);
  const [aircraftOverlayEnabled, setAircraftOverlayEnabled] = useState(false);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [aircraftData, setAircraftData] = useState<any[]>([]);
  const [flightPaths, setFlightPaths] = useState<Map<string, any[]>>(new Map());
  const flightPathsRef = useRef<Map<string, any>>(new Map()); // Track flight path polylines
  const [dispatchOverlayEnabled, setDispatchOverlayEnabled] = useState(true); // Default to showing dispatch calls
  const [dispatchTimeFilter, setDispatchTimeFilter] = useState('24h'); // Default to 24 hours
  const [showTimeFilterDropdown, setShowTimeFilterDropdown] = useState(false);

  const lastBoundsUpdateRef = useRef<Date>(new Date());
  
  // Default Indianapolis center coordinates
  const INDIANAPOLIS_CENTER = { lat: 39.7684, lng: -86.1581 };
  
  // Call type emoji mapping
  const getCallTypeEmoji = (callType: string): string => {
    const emojiMap: Record<string, string> = {
      // Medical emergencies
      'Abdominal Pain': '🤕',
      'Abdominal Pain B': '🤕',
      'Abdominal/Back Pain': '🔴',
      'Abdominal/Back Pain B': '🔴',
      'Allergic Reaction': '🤧',
      'Allergic Reaction B': '🤧',
      'Assist Person': '🤝',
      'Assist Person B': '🤝',
      'Assist Person C': '🤝',
      'Bleeding': '🩸',
      'Bleeding Non-Traumatic': '🩸',
      'Bleeding Non-Traumatic B': '🩸',
      'Cardiac Arrest': '❤️',
      'Chest Pain/Heart': '💔',
      'Diabetic': '💉',
      'Diabetic B': '💉',
      'Difficulty Breathing': '😤',
      'Environmental': '🌡️',
      'Gunshot': '🔫',
      'Gunshot Wound': '🔫',
      'Headache': '🤯',
      'Injured Person': '🤕',
      'Injured Person B': '🤕',
      'Injured Person C': '🤕',
      'Mental/Emotional': '🧠',
      'Mental/Emotional B': '🧠',
      'Mental-Emotional': '🧠',
      'Mental-Emotional B': '🧠',
      'OB/Childbirth': '👶',
      'OB/Childbirth B': '👶',
      'Overdose': '💊',
      'Overdose B': '💊',
      'Overdose C': '💊',
      'Pediatric Cardiac Arrest': '👶',
      'Seizure': '⚡',
      'Seizure B': '⚡',
      'Sick Person': '🤒',
      'Sick Person A': '🤒',
      'Sick Person B': '🤒',
      'Sick Person C': '🤒',
      'Stroke/CVA': '🧠',
      'Unconscious Person': '😵',
      'Unconscious Person B': '😵',
      
      // Trauma
      'Vehicle Accident': '🚗',
      'Vehicle Accident B': '🚗',
      'Vehicle Accident C': '🚗',
      'Trauma/MVC': '🚑',
      'Mass Casualty': '🚨',
      
      // Fire
      'Fire/Hazmat': '🔥',
      'Residential Fire': '🏠',
      'Structure Fire': '🏢',
      'House Fire': '🏠',
      'Building Fire': '🏢',
      'Vehicle Fire': '🚗',
      'Grass Fire': '🌾',
      'Trash Fire': '🗑️',
      'Building Alarm': '🔔',
      
      // Investigation
      'Investigation': '🔍',
      
      // Hospital
      'EMS-Hospital Communications': '🏥',
      
      // General
      'Medical Emergency': '🚑',
      'Unknown Call Type': '❓',
      'Unknown': '❓'
    };
    
    return emojiMap[callType] || '📍';
  };
  
  // Weather overlay simplified to radar only

  // Helper function to filter calls by time
  const getFilteredCalls = () => {
    if (!dispatchOverlayEnabled) {
      return [];
    }
    
    const now = new Date();
    const filterHours = {
      '1h': 1,
      '24h': 24,
      '7d': 24 * 7,
      '30d': 24 * 30
    };
    
    const hoursAgo = filterHours[dispatchTimeFilter as keyof typeof filterHours];
    const cutoffTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    
    return calls.filter(call => {
      if (!call.latitude || !call.longitude) return false;
      const callTime = new Date(call.timestamp);
      return callTime >= cutoffTime;
    });
  };

  // Initialize Google Maps
  useEffect(() => {
    if (window.google) {
      setIsLoaded(true);
      return;
    }

    // Fetch API key from backend and load Google Maps
    const loadGoogleMaps = async () => {
      try {
        const response = await fetch('/api/config/google-maps-key');
        const data = await response.json();
        
        if (!response.ok || !data.apiKey) {
          console.error('Failed to fetch Google Maps API key:', data.error);
          return;
        }

        // Set up global callback
        window.initGoogleMap = () => {
          setIsLoaded(true);
        };

        // Load Google Maps script with the API key from backend
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&callback=initGoogleMap`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
          console.error('Failed to load Google Maps script');
        };
        document.head.appendChild(script);

        return () => {
          // Clean up
          if (document.head.contains(script)) {
            document.head.removeChild(script);
          }
          delete (window as any).initGoogleMap;
        };
      } catch (error) {
        console.error('Error loading Google Maps:', error);
      }
    };

    loadGoogleMaps();
  }, []);

  // Create map instance
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstanceRef.current) return;

    try {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 39.7684, lng: -86.1581 }, // Indianapolis center
        zoom: 11,
        styles: [
          {
            featureType: "all",
            elementType: "geometry",
            stylers: [{ color: "#242f3e" }]
          },
          {
            featureType: "all",
            elementType: "labels.text.stroke",
            stylers: [{ color: "#242f3e" }]
          },
          {
            featureType: "all",
            elementType: "labels.text.fill",
            stylers: [{ color: "#746855" }]
          },
          {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#17263c" }]
          },
          {
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#38414e" }]
          },
          {
            featureType: "road.highway",
            elementType: "geometry",
            stylers: [{ color: "#746855" }]
          },
          // Hide all POI labels and icons
          {
            featureType: "poi",
            stylers: [{ visibility: "off" }]
          },
          {
            featureType: "poi.business",
            stylers: [{ visibility: "off" }]
          },
          {
            featureType: "poi.attraction",
            stylers: [{ visibility: "off" }]
          },
          {
            featureType: "poi.government",
            stylers: [{ visibility: "off" }]
          },
          {
            featureType: "poi.medical",
            stylers: [{ visibility: "off" }]
          },
          {
            featureType: "poi.park",
            stylers: [{ visibility: "off" }]
          },
          {
            featureType: "poi.place_of_worship",
            stylers: [{ visibility: "off" }]
          },
          {
            featureType: "poi.school",
            stylers: [{ visibility: "off" }]
          },
          {
            featureType: "poi.sports_complex",
            stylers: [{ visibility: "off" }]
          },
          // Hide transit stations
          {
            featureType: "transit.station",
            stylers: [{ visibility: "off" }]
          }
        ],
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        zoomControl: true
      });

      console.log('Google Map created successfully');
    } catch (error) {
      console.error('Error creating Google Map:', error);
    }
  }, [isLoaded]);

  // Hospital overlay functionality completely removed

  // Update markers when calls change - efficient diffing to prevent flickering
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    // Filter calls with valid coordinates and apply time filter if dispatch overlay is enabled
    const callsToShow = dispatchOverlayEnabled ? getFilteredCalls() : calls;
    const geocodedCalls = callsToShow.filter(call => 
      call.latitude != null && 
      call.longitude != null && 
      !isNaN(call.latitude) && 
      !isNaN(call.longitude)
    );

    // Create a set of current call IDs for quick lookup
    const currentCallIds = new Set(geocodedCalls.map(call => call.id));
    
    // Remove markers for calls that no longer exist
    const markersToRemove: number[] = [];
    markersMapRef.current.forEach((marker, callId) => {
      if (!currentCallIds.has(callId)) {
        marker.setMap(null);
        markersToRemove.push(callId);
      }
    });
    markersToRemove.forEach(id => markersMapRef.current.delete(id));

    // Add or update markers for current calls
    let newMarkersAdded = false;
    geocodedCalls.forEach(call => {
      try {
        const existingMarker = markersMapRef.current.get(call.id);
        
        if (!existingMarker) {
          // Create new marker
          const marker = new window.google.maps.Marker({
            position: { lat: call.latitude!, lng: call.longitude! },
            map: mapInstanceRef.current,
            title: `${call.callType} - ${call.location || 'Unknown location'}`,
            icon: {
              url: getMarkerIcon(call.callType),
              scaledSize: new window.google.maps.Size(40, 40),
              anchor: new window.google.maps.Point(20, 20)
            }
          });

          // Add click listener
          marker.addListener('click', () => {
            if (onCallSelect) {
              onCallSelect(call);
            }
          });

          markersMapRef.current.set(call.id, marker);
          newMarkersAdded = true;
        } else {
          // Update existing marker position if it changed
          const currentPos = existingMarker.getPosition();
          if (currentPos.lat() !== call.latitude || currentPos.lng() !== call.longitude) {
            existingMarker.setPosition({ lat: call.latitude!, lng: call.longitude! });
          }
        }
      } catch (error) {
        console.error('Error creating/updating marker for call:', call.id, error);
      }
    });

    // Only adjust bounds if we added new markers AND enough time has passed
    if (newMarkersAdded && geocodedCalls.length > 0) {
      const now = new Date();
      const timeSinceLastUpdate = now.getTime() - lastBoundsUpdateRef.current.getTime();
      
      // Only update bounds every 30 seconds to prevent constant panning
      if (timeSinceLastUpdate > 30000) {
        const bounds = new window.google.maps.LatLngBounds();
        geocodedCalls.forEach(call => {
          bounds.extend({ lat: call.latitude!, lng: call.longitude! });
        });
        mapInstanceRef.current.fitBounds(bounds);
        
        // Ensure minimum zoom level
        const listener = window.google.maps.event.addListenerOnce(mapInstanceRef.current, 'bounds_changed', () => {
          if (mapInstanceRef.current.getZoom() > 15) {
            mapInstanceRef.current.setZoom(15);
          }
        });
        
        lastBoundsUpdateRef.current = now;
      }
    }
  }, [calls, onCallSelect, dispatchOverlayEnabled, dispatchTimeFilter]);

  const getMarkerIcon = (callType: string | null) => {
    const emoji = getCallTypeEmoji(callType || 'Unknown');
    // Create a simple SVG icon with emoji
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="18" fill="rgba(255,255,255,0.95)" stroke="#2c3e50" stroke-width="2"/>
      <text x="20" y="26" text-anchor="middle" font-size="20" fill="#000">${emoji}</text>
    </svg>`;
    
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgIcon);
  };



  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  // Radar overlay management - simplified to radar only with 30-second updates
  const toggleRadarOverlay = async () => {
    if (!mapInstanceRef.current) return;

    if (weatherOverlayEnabled) {
      // Remove radar overlay
      mapInstanceRef.current.overlayMapTypes.clear();
      weatherOverlaysRef.current = [];
      setWeatherOverlayEnabled(false);
      // Clear the update interval
      if (radarUpdateInterval.current) {
        clearInterval(radarUpdateInterval.current);
        radarUpdateInterval.current = null;
      }
    } else {
      // Enable radar overlay
      await loadRadarOverlay();
      setWeatherOverlayEnabled(true);
      // Start 30-second update interval
      radarUpdateInterval.current = setInterval(() => {
        loadRadarOverlay();
      }, 30000);
    }
  };

  const loadRadarOverlay = async () => {
    if (!mapInstanceRef.current) return;

    try {
      const response = await fetch('/api/weather/overlays?zoom=10');
      if (response.ok) {
        const overlays = await response.json();
        
        // Clear existing overlays
        mapInstanceRef.current.overlayMapTypes.clear();
        weatherOverlaysRef.current = [];
        
        // Add radar layer only
        if (overlays.precipitation && window.google) {
          const radarOverlay = new window.google.maps.ImageMapType({
            getTileUrl: (coord: any, zoom: number) => {
              const url = overlays.precipitation
                .replace('{z}', zoom.toString())
                .replace('{x}', coord.x.toString())
                .replace('{y}', coord.y.toString());
              return url;
            },
            tileSize: new window.google.maps.Size(256, 256),
            opacity: 0.6,
            name: 'Weather Radar'
          });
          
          mapInstanceRef.current.overlayMapTypes.push(radarOverlay);
          weatherOverlaysRef.current.push(radarOverlay);
        }
      } else {
        console.error('Failed to fetch radar overlay:', response.statusText);
      }
    } catch (error) {
      console.error('Error loading radar overlay:', error);
    }
  };

  // Flight path management
  const toggleFlightPath = async (aircraftId: string) => {
    if (!mapInstanceRef.current) return;

    try {
      // Check if flight path is already displayed
      const existingPath = flightPathsRef.current.get(aircraftId);
      
      if (existingPath) {
        // Remove flight path
        existingPath.setMap(null);
        flightPathsRef.current.delete(aircraftId);
        console.log(`Removed flight path for ${aircraftId}`);
      } else {
        // Fetch and display flight path
        const response = await fetch(`/api/aircraft/${aircraftId}/path`);
        if (response.ok) {
          const pathData = await response.json();
          
          if (pathData && pathData.length > 0) {
            // Create polyline from flight path data
            const pathCoordinates = pathData.map((point: any) => ({
              lat: point.latitude,
              lng: point.longitude
            }));

            const flightPath = new window.google.maps.Polyline({
              path: pathCoordinates,
              geodesic: true,
              strokeColor: '#FF6B35', // Orange color for flight path
              strokeOpacity: 0.8,
              strokeWeight: 3,
              icons: [{
                icon: {
                  path: window.google.maps.SymbolPath.FORWARD_OPEN_ARROW,
                  scale: 3,
                  strokeColor: '#FF6B35'
                },
                offset: '100%',
                repeat: '20px'
              }]
            });

            flightPath.setMap(mapInstanceRef.current);
            flightPathsRef.current.set(aircraftId, flightPath);
            
            // Update state for re-renders
            setFlightPaths(new Map(flightPathsRef.current));
            
            console.log(`Added flight path for ${aircraftId} with ${pathData.length} points`);
          } else {
            console.log(`No flight path data available for ${aircraftId}`);
          }
        } else {
          console.error(`Failed to fetch flight path for ${aircraftId}:`, response.statusText);
        }
      }
    } catch (error) {
      console.error(`Error toggling flight path for ${aircraftId}:`, error);
    }
  };

  // Aircraft overlay management
  const toggleAircraftOverlay = async () => {
    if (!mapInstanceRef.current) return;

    if (aircraftOverlayEnabled) {
      // Remove aircraft markers
      aircraftMarkersRef.current.forEach(marker => {
        marker.setMap(null);
      });
      aircraftMarkersRef.current = [];
      setAircraftOverlayEnabled(false);
    } else {
      // Add aircraft markers (all aircraft with helicopter highlighting)
      try {
        const response = await fetch('/api/aircraft/near-indianapolis?radius=100');
        if (response.ok) {
          const aircraft = await response.json();
          setAircraftData(aircraft);
          
          aircraft.forEach((plane: any) => {
            if (plane.latitude && plane.longitude) {
              const marker = new window.google.maps.Marker({
                position: { lat: plane.latitude, lng: plane.longitude },
                map: mapInstanceRef.current,
                title: `${plane.callsign} - ${plane.altitude}ft`,
                icon: {
                  path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 6,
                  rotation: plane.heading || 0,
                  fillColor: plane.isHelicopter ? '#ff6b35' : '#4285f4',
                  fillOpacity: 0.8,
                  strokeColor: '#ffffff',
                  strokeWeight: 1
                }
              });

              const infoContent = `
                <div style="padding: 12px; background: #1f2937; border-radius: 8px; color: #ffffff; min-width: 250px;">
                  <div style="font-weight: bold; margin-bottom: 8px; color: #ffffff; font-size: 14px;">
                    🚁 ${plane.callsign}
                  </div>
                  <div style="font-size: 12px; color: #d1d5db; margin-bottom: 4px; line-height: 1.4;">
                    <strong>Registration:</strong> ${plane.registration || 'N/A'}
                  </div>
                  <div style="font-size: 12px; color: #d1d5db; margin-bottom: 4px; line-height: 1.4;">
                    <strong>Aircraft Type:</strong> ${plane.aircraftType || 'Helicopter'}
                  </div>
                  <div style="font-size: 12px; color: #d1d5db; margin-bottom: 4px; line-height: 1.4;">
                    <strong>Origin Airport:</strong> ${plane.originAirport || 'Unknown'}
                  </div>
                  <div style="font-size: 12px; color: #d1d5db; margin-bottom: 4px; line-height: 1.4;">
                    <strong>Takeoff Time:</strong> ${plane.departureTime || 'N/A'}
                  </div>
                  <div style="font-size: 12px; color: #d1d5db; margin-bottom: 4px; line-height: 1.4;">
                    <strong>Time Ago:</strong> ${plane.timeAgo || 'N/A'}
                  </div>
                  <div style="font-size: 12px; color: #d1d5db; margin-bottom: 4px; line-height: 1.4;">
                    <strong>Altitude:</strong> ${plane.altitude}ft
                  </div>
                  <div style="font-size: 12px; color: #d1d5db; margin-bottom: 4px; line-height: 1.4;">
                    <strong>Speed:</strong> ${Math.round(plane.velocity || 0)} knots
                  </div>
                  <div style="font-size: 12px; color: #d1d5db; line-height: 1.4;">
                    <strong>Heading:</strong> ${Math.round(plane.heading || 0)}°
                  </div>
                </div>
              `;

              const infoWindow = new window.google.maps.InfoWindow({
                content: infoContent
              });

              marker.addListener('click', async () => {
                // Toggle flight path display
                await toggleFlightPath(plane.id);
                infoWindow.open(mapInstanceRef.current, marker);
              });

              aircraftMarkersRef.current.push(marker);
            }
          });
          
          setAircraftOverlayEnabled(true);
        }
      } catch (error) {
        console.error('Error loading aircraft overlay:', error);
      }
    }
  };

  // Handle tab switching visibility to prevent map disappearing
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mapInstanceRef.current && mapRef.current) {
        console.log('Tab became visible, forcing map restoration...');
        
        // Force map restoration with multiple approaches
        setTimeout(() => {
          if (mapInstanceRef.current && mapRef.current) {
            // Check if map container has proper dimensions
            const mapDiv = mapRef.current;
            if (mapDiv.offsetWidth === 0 || mapDiv.offsetHeight === 0) {
              console.log('Map container has no dimensions, forcing re-layout');
              mapDiv.style.width = '100%';
              mapDiv.style.height = '100%';
            }
            
            // Force resize event
            window.google.maps.event.trigger(mapInstanceRef.current, 'resize');
            
            // Force the map to recenter and rezoom
            const savedCenter = mapInstanceRef.current.getCenter();
            const savedZoom = mapInstanceRef.current.getZoom();
            
            // Set center and zoom explicitly
            if (savedCenter) {
              mapInstanceRef.current.setCenter(savedCenter);
              mapInstanceRef.current.setZoom(savedZoom || 11);
            } else {
              // Fallback to Indianapolis center
              mapInstanceRef.current.setCenter({ lat: 39.7684, lng: -86.1581 });
              mapInstanceRef.current.setZoom(11);
            }
            
            // Force a pan to trigger map redraw
            mapInstanceRef.current.panBy(1, 0);
            setTimeout(() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.panBy(-1, 0);
              }
            }, 50);
            
            // Force re-trigger of marker effects after tab switch
            if (calls.length > 0) {
              console.log('Restoring markers after tab switch');
              // Make all existing markers visible again
              markersMapRef.current.forEach((marker, callId) => {
                if (marker.getMap() !== mapInstanceRef.current) {
                  marker.setMap(mapInstanceRef.current);
                }
              });
            }
            
            // Force aircraft overlay refresh if it was enabled
            if (aircraftMarkersRef.current.length === 0 && aircraftOverlayEnabled) {
              console.log('Refreshing aircraft overlay after tab switch');
              // Re-trigger aircraft overlay
              setAircraftOverlayEnabled(false);
              setTimeout(() => setAircraftOverlayEnabled(true), 200);
            }
            
            console.log('Map restoration complete');
          }
        }, 200);
      }
    };

    const handleWindowFocus = () => {
      if (mapInstanceRef.current) {
        setTimeout(() => {
          if (mapInstanceRef.current) {
            window.google.maps.event.trigger(mapInstanceRef.current, 'resize');
          }
        }, 100);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      
      if (radarUpdateInterval.current) {
        clearInterval(radarUpdateInterval.current);
        radarUpdateInterval.current = null;
      }
      
      // Clear all flight paths on cleanup
      flightPathsRef.current.forEach((path) => {
        path.setMap(null);
      });
      flightPathsRef.current.clear();
    };
  }, [calls, aircraftOverlayEnabled]);

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading Google Maps...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full rounded-lg" />
      
      {/* Map Controls */}
      <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 space-y-3 min-w-[180px]">
        <button
          onClick={() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.setCenter({ lat: 39.7684, lng: -86.1581 });
              mapInstanceRef.current.setZoom(11);
            }
          }}
          className="w-full px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Reset View
        </button>
        
        <div className="border-t border-gray-200 dark:border-gray-600 pt-2">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Overlays</div>
          
          <button
            onClick={toggleRadarOverlay}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded transition-colors ${
              weatherOverlayEnabled 
                ? 'bg-blue-500 text-white hover:bg-blue-600' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              <span>Radar</span>
            </div>
            {weatherOverlayEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          
          <button
            onClick={toggleAircraftOverlay}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded transition-colors mt-1 ${
              aircraftOverlayEnabled 
                ? 'bg-orange-500 text-white hover:bg-orange-600' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4" />
              <span>Helicopters</span>
            </div>
            {aircraftOverlayEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          
          <div className="mt-1 relative">
            <button
              onClick={() => {
                if (!dispatchOverlayEnabled) {
                  setDispatchOverlayEnabled(true);
                  setShowTimeFilterDropdown(true);
                } else {
                  setShowTimeFilterDropdown(!showTimeFilterDropdown);
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded transition-colors ${
                dispatchOverlayEnabled 
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>Dispatch Calls {dispatchOverlayEnabled && `(${dispatchTimeFilter})`}</span>
              </div>
              {dispatchOverlayEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            
            {showTimeFilterDropdown && dispatchOverlayEnabled && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                <div className="py-1">
                  {['1h', '24h', '7d', '30d'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => {
                        setDispatchTimeFilter(filter);
                        setShowTimeFilterDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        dispatchTimeFilter === filter ? 'bg-gray-100 dark:bg-gray-700' : ''
                      }`}
                    >
                      Last {filter === '1h' ? '1 hour' : filter === '24h' ? '24 hours' : filter === '7d' ? '7 days' : '30 days'}
                    </button>
                  ))}
                  <hr className="my-1 border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={() => {
                      setDispatchOverlayEnabled(false);
                      setShowTimeFilterDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Disable Overlay
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
        
        <div className="border-t border-gray-200 dark:border-gray-600 pt-2">
          <div className="text-xs text-gray-600 dark:text-gray-400 text-center">
            {calls.filter(c => c.latitude && c.longitude).length} emergency calls
          </div>
          {aircraftOverlayEnabled && aircraftData.length > 0 && (
            <div className="text-xs text-gray-600 dark:text-gray-400 text-center">
              {aircraftData.length} helicopters nearby
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export { GoogleMapView };