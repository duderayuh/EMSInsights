import { useEffect, useRef, useState, useCallback } from "react";
import { Call } from "@shared/schema";
import { Building, Cloud, Plane, Eye, EyeOff, MapPin, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AppleMapViewProps {
  calls: Call[];
  onCallSelect?: (call: Call) => void;
  newCallIds?: Set<number>;
  hoveredCallId?: number | null;
}

declare global {
  interface Window {
    mapkit: any;
  }
}

const INDIANAPOLIS_CENTER = { lat: 39.7684, lng: -86.1581 };

// Comprehensive hospital locations in Indianapolis
const HOSPITALS = [
  { name: "IU Health Methodist Hospital", lat: 39.7902, lng: -86.1832, type: "Level 1 Trauma" },
  { name: "Eskenazi Health", lat: 39.7774, lng: -86.1832, type: "Level 1 Trauma" },
  { name: "St. Vincent Indianapolis", lat: 39.9108, lng: -86.1458, type: "Level 2 Trauma" },
  { name: "Riley Children's Hospital", lat: 39.7774, lng: -86.1811, type: "Pediatric Level 1" },
  { name: "Community Hospital North", lat: 39.9667, lng: -86.1458, type: "General" },
  { name: "Community Hospital East", lat: 39.7945, lng: -86.0396, type: "General" },
  { name: "Community Hospital South", lat: 39.6368, lng: -86.0991, type: "General" },
  { name: "Franciscan Health Indianapolis", lat: 39.6237, lng: -86.1951, type: "General" },
  { name: "IU Health University Hospital", lat: 39.7774, lng: -86.1811, type: "Academic Medical" },
  { name: "St. Francis Hospital", lat: 39.5973, lng: -86.1093, type: "Heart Specialty" },
  { name: "Sidney & Lois Eskenazi Hospital", lat: 39.7774, lng: -86.1832, type: "Level 1 Trauma" },
  { name: "IU Health West Hospital", lat: 39.7482, lng: -86.3719, type: "General" }
];

function AppleMapView({ calls, onCallSelect, newCallIds, hoveredCallId }: AppleMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersMapRef = useRef<Map<number, any>>(new Map());
  const hospitalMarkersRef = useRef<any[]>([]);
  const clusterOverlaysRef = useRef<any[]>([]);
  const aircraftMarkersRef = useRef<any[]>([]);
  const weatherOverlaysRef = useRef<any[]>([]);
  const radarUpdateInterval = useRef<NodeJS.Timeout | null>(null);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [weatherOverlayEnabled, setWeatherOverlayEnabled] = useState(false);
  const [aircraftOverlayEnabled, setAircraftOverlayEnabled] = useState(false);
  const [dispatchOverlayEnabled, setDispatchOverlayEnabled] = useState(true);
  const [hospitalOverlayEnabled, setHospitalOverlayEnabled] = useState(true);
  const [clusterOverlayEnabled, setClusterOverlayEnabled] = useState(false);
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set());
  const [dispatchTimeFilter, setDispatchTimeFilter] = useState('24h');
  const [showTimeFilterDropdown, setShowTimeFilterDropdown] = useState(false);
  const [showClusterPanel, setShowClusterPanel] = useState(false);
  const [clusters, setClusters] = useState<any[]>([]);
  const [aircraftData, setAircraftData] = useState<any[]>([]);
  const [flightPaths, setFlightPaths] = useState<Map<string, any[]>>(new Map());
  const flightPathsRef = useRef<Map<string, any>>(new Map());

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
      'Pain': '😣',
      'Seizure': '⚡',
      'Seizure B': '⚡',
      'Sick Person': '🤒',
      'Sick Person B': '🤒',
      'Sick Person C': '🤒',
      'Stabbing': '🔪',
      'Stroke': '🧠',
      'Trauma': '🚨',
      'Trauma B': '🚨',
      'Traumatic Injury': '🚨',
      'Unconscious': '😵',
      'Unconscious Person': '😵',
      'Unconscious/Fainting': '😵',
      'Unresponsive': '😵',
      
      // Traffic/Vehicle
      'Auto Accident': '🚗',
      'Auto Accident B': '🚗',
      'Auto Accident C': '🚗',
      'MVC': '🚗',
      'MVC B': '🚗',
      'MVC C': '🚗',
      'Motor Vehicle Accident': '🚗',
      'Motor Vehicle Crash': '🚗',
      'Personal Injury Accident': '🚗',
      'PI Accident': '🚗',
      'Traffic Accident': '🚗',
      'Vehicle Accident': '🚗',
      'Pedestrian Struck': '🚶',
      'Motorcycle Accident': '🏍️',
      
      // Fire/Hazmat
      'Fire': '🔥',
      'Fire Alarm': '🔥',
      'Structure Fire': '🏢🔥',
      'Vehicle Fire': '🚗🔥',
      'Grass Fire': '🔥',
      'Hazmat': '☣️',
      'Gas Leak': '💨',
      'Chemical Spill': '☣️',
      
      // Special/Other
      'Choking': '🤐',
      'Drowning': '🌊',
      'Fall': '🤸',
      'Falls': '🤸',
      'Lift Assist': '🦽',
      'Welfare Check': '👀',
      'Unknown': '❓',
      'Other': '📍',
      'Test': '🧪',
      'Alarm': '🚨',
      'Public Assist': '🤝',
      'Investigation': '🔍'
    };
    
    // Try exact match first
    if (emojiMap[callType]) return emojiMap[callType];
    
    // Try case-insensitive match
    const lowerType = callType?.toLowerCase() || '';
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (key.toLowerCase() === lowerType) return emoji;
    }
    
    // Try partial matches for common patterns
    if (lowerType.includes('cardiac') || lowerType.includes('heart')) return '❤️';
    if (lowerType.includes('breath')) return '😤';
    if (lowerType.includes('accident') || lowerType.includes('mvc') || lowerType.includes('crash')) return '🚗';
    if (lowerType.includes('fire')) return '🔥';
    if (lowerType.includes('medical')) return '🏥';
    if (lowerType.includes('trauma')) return '🚨';
    if (lowerType.includes('overdose')) return '💊';
    if (lowerType.includes('mental') || lowerType.includes('emotional')) return '🧠';
    if (lowerType.includes('fall')) return '🤸';
    if (lowerType.includes('pain')) return '😣';
    if (lowerType.includes('sick')) return '🤒';
    if (lowerType.includes('unconscious') || lowerType.includes('unresponsive')) return '😵';
    
    // Default fallback
    return '📍';
  };

  // Filter calls based on time filter
  const getFilteredCalls = useCallback(() => {
    if (!dispatchOverlayEnabled) return [];
    
    const now = new Date();
    const cutoffTime = new Date();
    
    switch (dispatchTimeFilter) {
      case '1h':
        cutoffTime.setHours(now.getHours() - 1);
        break;
      case '6h':
        cutoffTime.setHours(now.getHours() - 6);
        break;
      case '12h':
        cutoffTime.setHours(now.getHours() - 12);
        break;
      case '24h':
        cutoffTime.setHours(now.getHours() - 24);
        break;
      case '48h':
        cutoffTime.setHours(now.getHours() - 48);
        break;
      case '7d':
        cutoffTime.setDate(now.getDate() - 7);
        break;
      case 'all':
      default:
        return calls.filter(call => 
          call.location?.trim() && 
          call.latitude && 
          call.longitude &&
          call.callType !== 'Test'
        );
    }
    
    return calls.filter(call => {
      if (!call.location?.trim() || !call.latitude || !call.longitude) return false;
      if (call.callType === 'Test') return false;
      const callTime = new Date(call.timestamp);
      return callTime >= cutoffTime;
    });
  }, [calls, dispatchOverlayEnabled, dispatchTimeFilter]);

  // Load clusters
  const loadClusters = useCallback(async () => {
    try {
      const response = await fetch('/api/analytics/medical-director-insights');
      if (response.ok) {
        const data = await response.json();
        setClusters(data);
      }
    } catch (error) {
      console.error('Failed to load clusters:', error);
    }
  }, []);

  // Initialize Apple MapKit
  useEffect(() => {
    if (isLoaded || !mapRef.current) return;

    const loadMapKit = async () => {
      // Check if mapkit is already loaded
      if (window.mapkit) {
        initializeMap();
        return;
      }

      try {
        // Fetch the Apple MapKit token from the API
        const response = await fetch('/api/config/apple-mapkit-token');
        if (!response.ok) {
          throw new Error('Failed to fetch Apple MapKit token');
        }
        const { token } = await response.json();
        
        if (!token) {
          throw new Error('Apple MapKit token not configured');
        }

        // Load MapKit JS
        const script = document.createElement('script');
        script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';
        script.crossOrigin = 'anonymous';
        script.dataset.libraries = 'map,services,annotations,overlays';
        script.dataset.initialToken = token;
        
        script.onload = () => {
          if (window.mapkit) {
            window.mapkit.init({
              authorizationCallback: function(done: any) {
                done(token);
              }
            });
            initializeMap();
          }
        };

        script.onerror = () => {
          console.error('Failed to load Apple MapKit JS');
        };

        document.head.appendChild(script);
      } catch (error) {
        console.error('Failed to initialize Apple MapKit:', error);
      }
    };

    const initializeMap = () => {
      if (!mapRef.current || !window.mapkit) return;

      try {
        // Create map with dark mode and better visibility
        const map = new window.mapkit.Map(mapRef.current, {
          center: new window.mapkit.Coordinate(INDIANAPOLIS_CENTER.lat, INDIANAPOLIS_CENTER.lng),
          mapType: window.mapkit.Map.MapTypes.Standard,
          colorScheme: window.mapkit.Map.ColorSchemes.Dark,
          showsCompass: window.mapkit.FeatureVisibility.Visible,
          showsMapTypeControl: true,
          showsZoomControl: true,
          showsUserLocationControl: false,
          region: new window.mapkit.CoordinateRegion(
            new window.mapkit.Coordinate(INDIANAPOLIS_CENTER.lat, INDIANAPOLIS_CENTER.lng),
            new window.mapkit.CoordinateSpan(0.3, 0.3)
          )
        });

        mapInstanceRef.current = map;
        setIsLoaded(true);
        console.log('Apple Map created successfully');
      } catch (error) {
        console.error('Failed to initialize Apple Map:', error);
      }
    };

    loadMapKit();
  }, []);

  // Update markers when calls or filters change
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;

    const map = mapInstanceRef.current;
    
    // Clear existing dispatch markers
    markersMapRef.current.forEach(marker => {
      map.removeAnnotation(marker);
    });
    markersMapRef.current.clear();

    // Add new markers for filtered calls
    const filteredCalls = getFilteredCalls();
    const uniqueLocations = new Map();
    
    // Group calls by location to prevent duplicates
    filteredCalls.forEach(call => {
      const key = `${call.latitude?.toFixed(6)}_${call.longitude?.toFixed(6)}`;
      if (!uniqueLocations.has(key)) {
        uniqueLocations.set(key, []);
      }
      uniqueLocations.get(key).push(call);
    });

    // Create markers for unique locations
    uniqueLocations.forEach((callsAtLocation, locationKey) => {
      const mostRecentCall = callsAtLocation.sort((a: Call, b: Call) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];

      if (!mostRecentCall.latitude || !mostRecentCall.longitude) return;

      const coordinate = new window.mapkit.Coordinate(
        mostRecentCall.latitude, 
        mostRecentCall.longitude
      );

      const emoji = getCallTypeEmoji(mostRecentCall.callType || 'Unknown');
      const isNewCall = newCallIds?.has(mostRecentCall.id) || false;
      const isHovered = hoveredCallId === mostRecentCall.id;
      
      // Create custom annotation with emoji
      const annotation = new window.mapkit.Annotation(coordinate, (coordinate: any, options: any) => {
        const div = document.createElement('div');
        // Apply hover class if this marker is being hovered from sidebar
        div.className = isHovered ? 'apple-map-marker hover-marker' : 
                       isNewCall ? 'apple-map-marker pulse-marker' : 
                       'apple-map-marker';
        div.style.fontSize = '24px';
        div.style.cursor = 'pointer';
        div.style.filter = isHovered ? 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.8))' : 
                          'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
        div.style.transform = isHovered ? 'scale(1.8)' : 'scale(1.2)';
        div.style.transition = 'transform 0.2s';
        div.style.zIndex = isHovered ? '10000' : '1';
        div.textContent = emoji;
        
        div.onmouseenter = () => {
          div.style.transform = 'scale(1.5)';
        };
        div.onmouseleave = () => {
          div.style.transform = 'scale(1.2)';
        };
        
        div.onclick = () => {
          if (onCallSelect) {
            onCallSelect(mostRecentCall);
          }
        };
        
        return div;
      });

      annotation.title = mostRecentCall.callType || 'Emergency Call';
      annotation.subtitle = `${mostRecentCall.location} (${callsAtLocation.length} call${callsAtLocation.length > 1 ? 's' : ''})`;
      annotation.animates = true;
      annotation.displayPriority = 1000;
      
      map.addAnnotation(annotation);
      markersMapRef.current.set(mostRecentCall.id, annotation);
    });

  }, [getFilteredCalls, isLoaded, onCallSelect, newCallIds, hoveredCallId]);

  // Handle hospital overlay
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;

    const map = mapInstanceRef.current;
    
    // Clear existing hospital markers
    hospitalMarkersRef.current.forEach(marker => {
      map.removeAnnotation(marker);
    });
    hospitalMarkersRef.current = [];

    if (hospitalOverlayEnabled) {
      HOSPITALS.forEach(hospital => {
        const coordinate = new window.mapkit.Coordinate(hospital.lat, hospital.lng);
        
        const annotation = new window.mapkit.Annotation(coordinate, (coordinate: any, options: any) => {
          const div = document.createElement('div');
          div.className = 'hospital-marker';
          div.style.width = '30px';
          div.style.height = '30px';
          div.style.backgroundColor = hospital.type.includes('Trauma') ? '#dc2626' : '#3b82f6';
          div.style.border = '3px solid white';
          div.style.borderRadius = '50%';
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.justifyContent = 'center';
          div.style.fontSize = '16px';
          div.style.color = 'white';
          div.style.fontWeight = 'bold';
          div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
          div.style.cursor = 'pointer';
          div.innerHTML = '🏥';
          
          return div;
        });

        annotation.title = hospital.name;
        annotation.subtitle = hospital.type;
        annotation.displayPriority = 999;
        
        map.addAnnotation(annotation);
        hospitalMarkersRef.current.push(annotation);
      });
    }
  }, [hospitalOverlayEnabled, isLoaded]);

  // Handle cluster overlay
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;

    const map = mapInstanceRef.current;
    
    // Clear existing cluster overlays
    clusterOverlaysRef.current.forEach(overlay => {
      map.removeOverlay(overlay);
    });
    clusterOverlaysRef.current = [];

    if (clusterOverlayEnabled && selectedClusters.size > 0) {
      clusters.forEach(cluster => {
        if (!selectedClusters.has(cluster.id)) return;
        
        const coordinates = cluster.points.map((point: any) => 
          new window.mapkit.Coordinate(point.lat, point.lng)
        );

        if (coordinates.length > 0) {
          // Create polygon overlay for cluster
          const style = new window.mapkit.Style({
            fillColor: cluster.severity === 'high' ? 'rgba(239, 68, 68, 0.3)' : 
                       cluster.severity === 'medium' ? 'rgba(251, 191, 36, 0.3)' : 
                       'rgba(34, 197, 94, 0.3)',
            strokeColor: cluster.severity === 'high' ? '#dc2626' : 
                        cluster.severity === 'medium' ? '#f59e0b' : 
                        '#16a34a',
            lineWidth: 2,
            lineDash: [5, 5]
          });

          const polygon = new window.mapkit.PolygonOverlay(coordinates, { style });
          map.addOverlay(polygon);
          clusterOverlaysRef.current.push(polygon);
        }
      });
    }
  }, [clusterOverlayEnabled, selectedClusters, clusters, isLoaded]);

  // Load clusters when panel is opened
  useEffect(() => {
    if (showClusterPanel) {
      loadClusters();
    }
  }, [showClusterPanel, loadClusters]);

  // Update aircraft overlay
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;

    const map = mapInstanceRef.current;
    
    // Clear existing aircraft markers and paths
    aircraftMarkersRef.current.forEach(marker => {
      map.removeAnnotation(marker);
    });
    aircraftMarkersRef.current = [];
    
    flightPathsRef.current.forEach(path => {
      map.removeOverlay(path);
    });
    flightPathsRef.current.clear();

    if (aircraftOverlayEnabled) {
      // Fetch aircraft data
      const fetchAircraft = async () => {
        try {
          const bounds = map.region.toBoundingRegion();
          const response = await fetch(`/api/overlays/aircraft?north=${bounds.northLatitude}&south=${bounds.southLatitude}&east=${bounds.eastLongitude}&west=${bounds.westLongitude}`);
          
          if (response.ok) {
            const data = await response.json();
            setAircraftData(data);
            
            // Add aircraft markers
            data.forEach((aircraft: any) => {
              const coordinate = new window.mapkit.Coordinate(aircraft.latitude, aircraft.longitude);
              
              const annotation = new window.mapkit.Annotation(coordinate, (coordinate: any, options: any) => {
                const div = document.createElement('div');
                div.style.fontSize = '20px';
                div.style.transform = `rotate(${aircraft.track || 0}deg)`;
                div.textContent = '✈️';
                return div;
              });

              annotation.title = aircraft.callsign || aircraft.registration || 'Unknown Aircraft';
              annotation.subtitle = `Alt: ${aircraft.altitude}ft, Speed: ${aircraft.speed}kts`;
              
              map.addAnnotation(annotation);
              aircraftMarkersRef.current.push(annotation);
            });
          }
        } catch (error) {
          console.error('Failed to fetch aircraft data:', error);
        }
      };

      fetchAircraft();
      
      // Set up periodic updates
      if (radarUpdateInterval.current) {
        clearInterval(radarUpdateInterval.current);
      }
      radarUpdateInterval.current = setInterval(fetchAircraft, 30000);
    } else {
      // Clear update interval
      if (radarUpdateInterval.current) {
        clearInterval(radarUpdateInterval.current);
        radarUpdateInterval.current = null;
      }
    }

    return () => {
      if (radarUpdateInterval.current) {
        clearInterval(radarUpdateInterval.current);
      }
    };
  }, [aircraftOverlayEnabled, isLoaded]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (radarUpdateInterval.current) {
        clearInterval(radarUpdateInterval.current);
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      {/* Map Container */}
      <div ref={mapRef} className="h-full w-full" />
      
      {/* Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* Dispatch Overlay Control */}
        <div className="flex items-center gap-2">
          <Button
            variant={dispatchOverlayEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => setDispatchOverlayEnabled(!dispatchOverlayEnabled)}
            className="bg-background/95 backdrop-blur w-36"
          >
            <MapPin className="h-4 w-4 mr-1" />
            Dispatch Calls
            {dispatchOverlayEnabled && (
              <Badge variant="secondary" className="ml-2">
                {getFilteredCalls().length}
              </Badge>
            )}
          </Button>
          
          {dispatchOverlayEnabled && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTimeFilterDropdown(!showTimeFilterDropdown)}
                className="bg-background/95 backdrop-blur"
              >
                <Filter className="h-4 w-4 mr-1" />
                {dispatchTimeFilter === 'all' ? 'All Time' : dispatchTimeFilter}
              </Button>
              
              {showTimeFilterDropdown && (
                <Card className="absolute top-full mt-1 left-0 p-2 bg-background/95 backdrop-blur z-50">
                  <div className="flex flex-col gap-1">
                    {['1h', '6h', '12h', '24h', '48h', '7d', 'all'].map(filter => (
                      <Button
                        key={filter}
                        variant={dispatchTimeFilter === filter ? "default" : "ghost"}
                        size="sm"
                        onClick={() => {
                          setDispatchTimeFilter(filter);
                          setShowTimeFilterDropdown(false);
                        }}
                        className="justify-start"
                      >
                        {filter === 'all' ? 'All Time' : filter}
                      </Button>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Hospital Overlay Control */}
        <Button
          variant={hospitalOverlayEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => setHospitalOverlayEnabled(!hospitalOverlayEnabled)}
          className="bg-background/95 backdrop-blur w-36 overflow-hidden"
        >
          <span className="flex items-center justify-between w-full">
            <span className="flex items-center">
              <Building className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className="truncate">Hospitals</span>
            </span>
            {hospitalOverlayEnabled && (
              <Eye className="h-4 w-4 ml-1 flex-shrink-0" />
            )}
          </span>
        </Button>

        {/* Cluster Analysis Control */}
        <Button
          variant={clusterOverlayEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setClusterOverlayEnabled(!clusterOverlayEnabled);
            setShowClusterPanel(!showClusterPanel);
          }}
          className="bg-background/95 backdrop-blur w-36 overflow-hidden"
        >
          <span className="flex items-center">
            <Filter className="h-4 w-4 mr-1 flex-shrink-0" />
            <span className="truncate">Cluster Analysis</span>
          </span>
        </Button>

        {/* Aircraft Overlay Control */}
        <Button
          variant={aircraftOverlayEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => setAircraftOverlayEnabled(!aircraftOverlayEnabled)}
          className="bg-background/95 backdrop-blur w-36 overflow-hidden"
        >
          <span className="flex items-center justify-between w-full">
            <span className="flex items-center">
              <Plane className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className="truncate">Aircraft</span>
            </span>
            {aircraftOverlayEnabled && aircraftData.length > 0 && (
              <Badge variant="secondary" className="ml-1 flex-shrink-0">
                {aircraftData.length}
              </Badge>
            )}
          </span>
        </Button>

        {/* Weather Overlay Control */}
        <Button
          variant={weatherOverlayEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => setWeatherOverlayEnabled(!weatherOverlayEnabled)}
          className="bg-background/95 backdrop-blur w-36 overflow-hidden"
        >
          <span className="flex items-center">
            <Cloud className="h-4 w-4 mr-1 flex-shrink-0" />
            <span className="truncate">Weather</span>
          </span>
        </Button>
      </div>

      {/* Cluster Selection Panel */}
      {showClusterPanel && (
        <Card className="absolute top-4 right-4 z-10 w-80 max-h-[70vh] bg-background/95 backdrop-blur">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Select Clusters</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowClusterPanel(false);
                  setClusterOverlayEnabled(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <ScrollArea className="h-[50vh]">
              <div className="space-y-2">
                {clusters.map(cluster => (
                  <div key={cluster.id} className="flex items-start space-x-2 p-2 border rounded">
                    <Checkbox
                      checked={selectedClusters.has(cluster.id)}
                      onCheckedChange={(checked) => {
                        const newSelected = new Set(selectedClusters);
                        if (checked) {
                          newSelected.add(cluster.id);
                        } else {
                          newSelected.delete(cluster.id);
                        }
                        setSelectedClusters(newSelected);
                      }}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        {cluster.primary_type || 'Mixed Types'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {cluster.call_count} calls • {cluster.severity} severity
                      </div>
                      <div className="text-xs mt-1">
                        {cluster.insights}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </Card>
      )}

      {/* Map Legend - Positioned below upper left controls */}
      <div className="absolute top-64 left-4 z-10">
        <Card className="p-3 bg-background/95 backdrop-blur w-36">
          <div className="text-xs font-semibold mb-2">Call Types</div>
          <div className="flex flex-col gap-1 text-xs">
            <div>🏥 Medical</div>
            <div>🚗 Vehicle</div>
            <div>🔥 Fire</div>
            <div>☣️ Hazmat</div>
            <div>🤕 Injury</div>
            <div>❤️ Cardiac</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AppleMapView;