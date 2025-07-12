import { AppHeader } from "@/components/AppHeader";
import { CallFeedSidebar } from "@/components/CallFeedSidebar";
import { MainDashboard } from "@/components/MainDashboard";
import { CallDetailModal } from "@/components/CallDetailModal";
import { HospitalCallsTab } from "@/components/HospitalCallsTab";
import { HospitalAnalyticsDashboard } from "@/components/HospitalAnalyticsDashboard";
import PublicHealthAnalytics from "@/pages/PublicHealthAnalytics";
import IncidentsPage from "@/pages/incidents";
import { MobileNavigation } from "@/components/MobileNavigation";
import { MobileDashboard } from "@/components/MobileDashboard";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Call } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Dashboard() {
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("10202");
  const [isMobile, setIsMobile] = useState(false);
  
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
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-foreground">
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b">
          <div className="flex items-center gap-3">
            <MobileNavigation user={user} unreadAlertsCount={unreadAlertsCount} />
            <div>
              <h1 className="text-lg font-semibold">EMS Insight</h1>
              <p className="text-xs text-muted-foreground">
                {displayStats.activeCalls} active • {displayStats.todayTotal} today
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-muted-foreground">
              {connectionStatus === 'connected' ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Mobile Dashboard Content */}
        <Tabs defaultValue="dashboard" className="flex-1">
          <div className="px-4 pt-2 pb-0">
            <TabsList className="grid w-full grid-cols-2 gap-1">
              <TabsTrigger value="dashboard" className="text-xs px-2">Dispatch</TabsTrigger>
              <TabsTrigger value="incidents" className="text-xs px-2">Unit Tracking</TabsTrigger>
            </TabsList>
            {hasAdminAccess && (
              <TabsList className="grid w-full grid-cols-3 gap-1 mt-1">
                <TabsTrigger value="hospital" className="text-xs px-1">Hospital</TabsTrigger>
                <TabsTrigger value="analytics" className="text-xs px-1">Analytics</TabsTrigger>
                <TabsTrigger value="public-health" className="text-xs px-1">Public Health</TabsTrigger>
              </TabsList>
            )}
          </div>
          
          <TabsContent value="dashboard" className="m-0 px-4 pb-4">
            <MobileDashboard />
          </TabsContent>
          
          <TabsContent value="incidents" className="m-0 h-[calc(100vh-180px)] overflow-y-auto">
            <IncidentsPage />
          </TabsContent>
          
          {hasAdminAccess && (
            <>
              <TabsContent value="hospital" className="m-0 h-[calc(100vh-180px)] overflow-y-auto">
                <HospitalCallsTab />
              </TabsContent>
              
              <TabsContent value="analytics" className="m-0 h-[calc(100vh-180px)] overflow-y-auto">
                <HospitalAnalyticsDashboard />
              </TabsContent>
              
              <TabsContent value="public-health" className="m-0 h-[calc(100vh-180px)] overflow-y-auto">
                <PublicHealthAnalytics />
              </TabsContent>
            </>
          )}
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
        <div className="border-b border-border bg-gray-50 dark:bg-gray-800 px-6">
          <TabsList className={`grid w-[900px] ${isAdmin ? 'grid-cols-5' : 'grid-cols-2'}`}>
            <TabsTrigger value="dashboard">Dispatch</TabsTrigger>
            <TabsTrigger value="incidents">Unit Tracking</TabsTrigger>
            {hasAdminAccess && <TabsTrigger value="hospital">EMS-Hospital Calls</TabsTrigger>}
            {hasAdminAccess && <TabsTrigger value="analytics">Analytics</TabsTrigger>}
            {hasAdminAccess && <TabsTrigger value="public-health">Public Health</TabsTrigger>}
          </TabsList>
        </div>
        
        <TabsContent value="dashboard" className="m-0 h-[calc(100vh-120px)]">
          <div className="flex h-full overflow-hidden">
            <CallFeedSidebar
              calls={filteredCalls}
              onCallSelect={handleCallSelect}
              onSearch={handleSearch}
              onPriorityFilter={handlePriorityFilter}
              isLoading={searchQuery ? isSearching : isLoading}
            />
            
            <MainDashboard
              calls={allCalls}
              stats={displayStats}
              onCallSelect={handleCallSelect}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="hospital" className="m-0 h-[calc(100vh-120px)]">
          <HospitalCallsTab />
        </TabsContent>
        
        <TabsContent value="analytics" className="m-0 h-[calc(100vh-120px)] overflow-y-auto">
          <HospitalAnalyticsDashboard />
        </TabsContent>
        
        <TabsContent value="public-health" className="m-0 h-[calc(100vh-120px)] overflow-y-auto">
          <PublicHealthAnalytics />
        </TabsContent>
        
        <TabsContent value="incidents" className="m-0 h-[calc(100vh-120px)] overflow-y-auto">
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
