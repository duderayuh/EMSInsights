import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { Call } from "@shared/schema";
import AppleMapView from "./AppleMapView";

interface MainDashboardProps {
  calls: Call[];
  stats: any;
  onCallSelect: (call: Call) => void;
}

export function MainDashboard({ calls, stats, onCallSelect }: MainDashboardProps) {
  const chartsInitialized = useRef(false);

  useEffect(() => {
    if (!chartsInitialized.current) {
      // Initialize charts if needed
      chartsInitialized.current = true;
    }
  }, []);

  // Expose function globally for map popup buttons
  useEffect(() => {
    (window as any).openCallDetails = (callId: number) => {
      const call = calls.find(c => c.id === callId);
      if (call) {
        onCallSelect(call);
      }
    };
    
    // Tab visibility handlers are now handled within AppleMapView component
    
    // Cleanup function
    return () => {
      delete (window as any).openCallDetails;
    };
  }, [calls, onCallSelect]);



  const activeCalls = calls.filter(call => call.status === 'active');
  const geocodedCalls = activeCalls.filter(call => call.latitude && call.longitude);

  return (
    <main className="flex-1 flex flex-col">
      {/* Map View */}
      <div className="flex-1 relative">
        {/* Apple Maps Container */}
        <AppleMapView calls={calls} onCallSelect={onCallSelect} />
        
        {/* Fallback for when map is loading */}
        {calls.length === 0 && (
          <div className="absolute inset-0 bg-gray-50 dark:bg-gray-800 bg-opacity-90 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600 dark:text-gray-300 mb-2">
                Indianapolis-Marion County EMS Coverage Area
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Monitoring MESA system for live emergency calls...
              </p>
            </div>
          </div>
        )}
      </div>


    </main>
  );
}
