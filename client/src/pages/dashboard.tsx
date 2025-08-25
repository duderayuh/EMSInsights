import { AppHeader } from "@/components/AppHeader";
import { CallFeedSidebar } from "@/components/CallFeedSidebar";
import { MainDashboard } from "@/components/MainDashboard";
import { CompactCallDetailModal } from "@/components/CompactCallDetailModal";
import { CallDetailModal } from "@/components/CallDetailModal";
import { HospitalCallsTab } from "@/components/HospitalCallsTab";
import { HospitalAnalyticsDashboard } from "@/components/HospitalAnalyticsDashboard";
import PublicHealthAnalytics from "@/pages/PublicHealthAnalytics";
import IncidentsPage from "@/pages/incidents";
import { MobileDashboard } from "@/components/MobileDashboard";
import MobileBottomNav from "@/components/MobileBottomNav";
import MobileHeader from "@/components/MobileHeader";
import { AudioPlaybar } from "@/components/AudioPlaybar";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Call } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Radio, Stethoscope, Users, BarChart3, Heart } from "lucide-react";

export default function Dashboard() {
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("10202");
  const [isMobile, setIsMobile] = useState(false);
  const [newCallIds, setNewCallIds] = useState<Set<number>>(new Set());
  const [hoveredCallId, setHoveredCallId] = useState<number | null>(null);
  
  const { user, hasAdminAccess } = useAuth();
  const isAdmin = hasAdminAccess; // Use hasAdminAccess for admin features
  
  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Get all calls for analytics and categories
  const { data: calls = [], isLoading } = useQuery({
    queryKey: ['/api/calls'],
    refetchInterval: 5000, // Refetch every 5 seconds to reduce map updates
  });

  // Get active calls for sidebar
  const { data: activeCallsData = [], isLoading: isActiveLoading } = useQuery({
    queryKey: ['/api/calls/active'],
    refetchInterval: 2000, // Refetch every 2 seconds for more responsive updates
  });

  // Search query for entire database
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['/api/calls', { query: searchQuery, priority: priorityFilter, limit: 500 }],
    enabled: !!searchQuery, // Only run when there's a search query
    refetchInterval: false, // Don't auto-refetch search results
  });

  const { data: stats } = useQuery({
    queryKey: ['/api/stats'],
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Get unread alerts count for mobile navigation
  const { data: unreadAlerts = [] } = useQuery({
    queryKey: ['/api/alerts/unread'],
    refetchInterval: 30000,
  });

  // WebSocket connection for real-time updates
  const { 
    calls: liveCalls, 
    stats: liveStats, 
    systemHealth, 
    connectionStatus 
  } = useWebSocket('/ws');

  // Use live data for sidebar only, API data for main dashboard
  const sidebarCalls: Call[] = liveCalls.length > 0 ? liveCalls : (activeCallsData as Call[]);
  const allCalls: Call[] = calls as Call[]; // Always use API data for full call history
  const displayStats = liveStats || stats || {
    totalCalls: 0,
    activeCalls: 0,
    todayTotal: 0,
    activeEmergency: 0,
    activeHigh: 0,
    avgResponse: 0
  };

  // Track new calls for highlighting
  useEffect(() => {
    if (sidebarCalls.length > 0) {
      const latestCall = sidebarCalls[0];
      const callAge = Date.now() - new Date(latestCall.timestamp).getTime();
      
      // If call is less than 30 seconds old, mark as new
      if (callAge < 30000 && !newCallIds.has(latestCall.id)) {
        setNewCallIds(prev => new Set([...Array.from(prev), latestCall.id]));
        
        // Remove new status after 10 seconds
        setTimeout(() => {
          setNewCallIds(prev => {
            const updated = new Set(prev);
            updated.delete(latestCall.id);
            return updated;
          });
        }, 10000);
      }
    }
  }, [sidebarCalls, newCallIds]);

  const handleCallSelect = (call: Call) => {
    setSelectedCall(call);
  };

  const handleCloseModal = () => {
    setSelectedCall(null);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handlePriorityFilter = (priority: string) => {
    setPriorityFilter(priority);
  };

  // Use search results if searching, otherwise use active calls with local filtering for sidebar
  const displayCalls = searchQuery 
    ? (searchResults as Call[]) // Search results are already filtered on the server
    : (sidebarCalls as Call[]).filter((call: Call) => { // Local filtering for sidebar active calls
        const matchesTalkgroup = !priorityFilter || priorityFilter === "all" || call.talkgroup === priorityFilter;
        return matchesTalkgroup;
      });

  const filteredCalls = displayCalls;
  const unreadAlertsCount = Array.isArray(unreadAlerts) ? unreadAlerts.length : 0;

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-foreground">
        {/* Mobile Header */}
        <MobileHeader />
        
        {/* Content Area with padding for fixed header, bottom nav, and AudioPlaybar */}
        <div className="pt-14 pb-32 h-screen overflow-hidden"> {/* Increased bottom padding for AudioPlaybar + bottom nav */}
          <div className="h-full overflow-y-auto">
            {/* Stats Overview */}
            <div className="bg-white dark:bg-gray-800 border-b px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {displayStats.activeCalls} Active Calls
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {displayStats.todayTotal} calls today
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-xs font-medium">
                    {connectionStatus === 'connected' ? 'Live' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="p-4">
              <MobileDashboard />
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <MobileBottomNav />

        {/* Modals */}
        {selectedCall && (
          <CompactCallDetailModal
            call={selectedCall}
            onClose={handleCloseModal}
          />
        )}
      </div>
    );
  }

  // Desktop Layout (existing)
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-foreground">
      <AppHeader 
        stats={displayStats}
        connectionStatus={connectionStatus}
        systemHealth={systemHealth}
      />
      
      <Tabs defaultValue="dashboard" className="flex-1" onValueChange={(value) => {
        // When switching to dashboard tab, refresh map after a short delay
        if (value === "dashboard") {
          setTimeout(() => {
            const mapElement = document.getElementById('emergencyMap');
            if (mapElement) {
              // Import and call refreshMap function
              import("@/lib/map-utils").then(({ refreshMap }) => {
                refreshMap();
              });
            }
          }, 300);
        }
      }}>
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-700 shadow-lg">
          <div className="px-6 py-3">
            <TabsList className="bg-transparent flex gap-2 w-full justify-center p-1">
              <TabsTrigger 
                value="dashboard" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:bg-gray-800/50 data-[state=inactive]:text-gray-300 data-[state=inactive]:hover:bg-gray-700/50 data-[state=inactive]:hover:text-white transition-all duration-200 px-6 py-3 rounded-lg flex items-center gap-2 font-medium"
              >
                <Radio className="h-4 w-4" />
                <span>Dispatch</span>
              </TabsTrigger>
              <TabsTrigger 
                value="hospital" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:bg-gray-800/50 data-[state=inactive]:text-gray-300 data-[state=inactive]:hover:bg-gray-700/50 data-[state=inactive]:hover:text-white transition-all duration-200 px-6 py-3 rounded-lg flex items-center gap-2 font-medium"
              >
                <Stethoscope className="h-4 w-4" />
                <span>EMS-Hospital</span>
              </TabsTrigger>
              <TabsTrigger 
                value="incidents" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:bg-gray-800/50 data-[state=inactive]:text-gray-300 data-[state=inactive]:hover:bg-gray-700/50 data-[state=inactive]:hover:text-white transition-all duration-200 px-6 py-3 rounded-lg flex items-center gap-2 font-medium"
              >
                <Users className="h-4 w-4" />
                <span>Unit Tracking</span>
              </TabsTrigger>
              <TabsTrigger 
                value="analytics" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:bg-gray-800/50 data-[state=inactive]:text-gray-300 data-[state=inactive]:hover:bg-gray-700/50 data-[state=inactive]:hover:text-white transition-all duration-200 px-6 py-3 rounded-lg flex items-center gap-2 font-medium"
              >
                <BarChart3 className="h-4 w-4" />
                <span>Analytics</span>
              </TabsTrigger>
              <TabsTrigger 
                value="public-health" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:bg-gray-800/50 data-[state=inactive]:text-gray-300 data-[state=inactive]:hover:bg-gray-700/50 data-[state=inactive]:hover:text-white transition-all duration-200 px-6 py-3 rounded-lg flex items-center gap-2 font-medium"
              >
                <Heart className="h-4 w-4" />
                <span>Public Health</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        
        <TabsContent value="dashboard" className="m-0 h-[calc(100vh-120px)]">
          <div className="flex h-[calc(100%-80px)] overflow-hidden"> {/* Reduced height for AudioPlaybar */}
            <CallFeedSidebar
              calls={filteredCalls}
              onCallSelect={handleCallSelect}
              onSearch={handleSearch}
              onPriorityFilter={handlePriorityFilter}
              isLoading={searchQuery ? isSearching : isLoading}
              newCallIds={newCallIds}
              onCallHover={setHoveredCallId}
            />
            
            <MainDashboard
              calls={allCalls}
              stats={displayStats}
              onCallSelect={handleCallSelect}
              newCallIds={newCallIds}
              hoveredCallId={hoveredCallId}
            />
          </div>
          <AudioPlaybar />
        </TabsContent>
        
        <TabsContent value="hospital" className="m-0 h-[calc(100vh-200px)]"> {/* Added padding for AudioPlaybar */}
          <HospitalCallsTab />
        </TabsContent>
        
        <TabsContent value="analytics" className="m-0 h-[calc(100vh-200px)] overflow-y-auto"> {/* Added padding for AudioPlaybar */}
          <HospitalAnalyticsDashboard />
        </TabsContent>
        
        <TabsContent value="public-health" className="m-0 h-[calc(100vh-200px)] overflow-y-auto"> {/* Added padding for AudioPlaybar */}
          <PublicHealthAnalytics />
        </TabsContent>
        
        <TabsContent value="incidents" className="m-0 h-[calc(100vh-200px)] overflow-y-auto"> {/* Added padding for AudioPlaybar */}
          <IncidentsPage />
        </TabsContent>
      </Tabs>

      {selectedCall && (
        <CallDetailModal
          call={selectedCall}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
