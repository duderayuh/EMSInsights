import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MobileLayout from "@/components/MobileLayout";
import AppleMapView from "@/components/AppleMapView";
import { Call } from "@shared/schema";
import { CallDetailModal } from "@/components/CallDetailModal";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

export default function MobileMapPage() {
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  
  // Get active calls
  const { data: activeCalls = [], isLoading } = useQuery({
    queryKey: ['/api/calls/active'],
    refetchInterval: 5000,
  });

  const handleCallSelect = (call: Call) => {
    setSelectedCall(call);
  };

  const handleCloseModal = () => {
    setSelectedCall(null);
  };

  return (
    <MobileLayout title="Live Map">
      <div className="relative h-[calc(100vh-8rem)]"> {/* Account for header and bottom nav */}
        {/* Active Calls Badge */}
        <div className="absolute top-2 left-2 z-10">
          <Badge variant="secondary" className="bg-white/90 dark:bg-gray-900/90 backdrop-blur">
            <Activity className="h-3 w-3 mr-1" />
            {(activeCalls as Call[]).length} Active
          </Badge>
        </div>
        
        {/* Apple Map */}
        <AppleMapView 
          calls={activeCalls as Call[]} 
          onCallSelect={handleCallSelect}
        />
        
        {/* Call Detail Modal */}
        {selectedCall && (
          <CallDetailModal
            call={selectedCall}
            onClose={handleCloseModal}
          />
        )}
      </div>
    </MobileLayout>
  );
}