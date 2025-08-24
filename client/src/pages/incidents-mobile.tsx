import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { MapPin, Clock, Truck, AlertTriangle, Building2, Filter, Wifi, WifiOff } from "lucide-react";
import type { Incident } from "@shared/schema";
import { useIncidentWebSocket } from "@/hooks/useIncidentWebSocket";
import MobileLayout from "@/components/MobileLayout";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function IncidentsMobilePage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState({ unit: "all", status: "all" });
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === 'incident_created' || message.type === 'incident_updated') {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/enhanced"] });
      
      if (message.type === 'incident_created') {
        toast({
          title: "New Incident",
          description: `Unit ${message.data.unitId} dispatched`,
        });
      }
    }
  }, [toast]);

  // WebSocket connection for live updates
  const { isConnected } = useIncidentWebSocket('/ws/incidents', handleWebSocketMessage);

  // Fetch enhanced incidents
  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ["/api/incidents/enhanced", filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter.unit && filter.unit !== "all") params.append("unit", filter.unit);
      if (filter.status && filter.status !== "all") params.append("status", filter.status);
      const response = await apiRequest("GET", `/api/incidents/enhanced?${params}`);
      const data = await response.json();
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Fetch units for dropdown
  const { data: units = [] } = useQuery({
    queryKey: ["/api/unit-tags/active"]
  });

  const statusColors: Record<string, string> = {
    dispatched: "bg-yellow-500/20 text-yellow-600 dark:bg-yellow-500/30 dark:text-yellow-400",
    enroute: "bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400",
    en_route: "bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400",
    on_scene: "bg-orange-500/20 text-orange-600 dark:bg-orange-500/30 dark:text-orange-400",
    transporting: "bg-purple-500/20 text-purple-600 dark:bg-purple-500/30 dark:text-purple-400",
    arriving_shortly: "bg-indigo-500/20 text-indigo-600 dark:bg-indigo-500/30 dark:text-indigo-400",
    at_hospital: "bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400",
    completed: "bg-gray-500/20 text-gray-600 dark:bg-gray-500/30 dark:text-gray-400"
  };

  const statusLabels = {
    dispatched: "Dispatched",
    enroute: "En Route",
    en_route: "En Route",
    on_scene: "On Scene",
    transporting: "Transporting",
    arriving_shortly: "Arriving",
    at_hospital: "At Hospital",
    completed: "Completed"
  };

  const renderIncidentCard = (incident: Incident) => (
    <Card 
      key={incident.id} 
      className="mb-3 cursor-pointer active:scale-98 transition-transform"
      onClick={() => setSelectedIncident(incident)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Truck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-base">{incident.unitId}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(incident.dispatchTime), "HH:mm")}
              </p>
            </div>
          </div>
          <Badge className={incident.status ? statusColors[incident.status] || "" : ""}>
            {incident.status ? statusLabels[incident.status as keyof typeof statusLabels] || incident.status : "Unknown"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {/* Location */}
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <span className="flex-1">{incident.location || "Location pending"}</span>
          </div>
          
          {/* Call Type */}
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <span>{incident.callType || "Unknown"}</span>
          </div>
          
          {/* Hospital & Response Time */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">
                {(incident as any).hospitalDestination || 
                 incident.actualHospitalCalled || 
                 incident.inferredClosestHospital || 
                 "No hospital"}
              </span>
            </div>
            {(incident as any).responseTime && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="text-xs">{(incident as any).responseTime}m</span>
              </div>
            )}
          </div>
          
          {/* QI Flag */}
          {incident.qiFlag && (
            <Badge variant="destructive" className="text-xs">
              QI Review Required
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (!isMobile) {
    // Redirect to desktop version
    import("./incidents").then(module => {
      const DesktopIncidents = module.default;
      return <DesktopIncidents />;
    });
    return null;
  }

  return (
    <MobileLayout title="Unit Tracking">
      {/* Connection Status */}
      <div className="flex items-center justify-between mb-4 px-4 py-2 bg-background/50 rounded-lg">
        <span className="text-sm font-medium">
          {incidents.length} Active Units
        </span>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Wifi className="h-3 w-3 text-green-500" />
              <span className="text-xs text-green-600 dark:text-green-400">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-gray-400" />
              <span className="text-xs text-gray-500">Offline</span>
            </>
          )}
        </div>
      </div>

      {/* Filter Button */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="w-full mb-4 h-10">
            <Filter className="h-4 w-4 mr-2" />
            Filter Units
            {(filter.unit !== "all" || filter.status !== "all") && (
              <Badge variant="secondary" className="ml-2">
                Active
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[40vh]">
          <SheetHeader>
            <SheetTitle>Filter Units</SheetTitle>
            <SheetDescription>
              Filter incidents by unit or status
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Unit</Label>
              <Select value={filter.unit} onValueChange={(value) => setFilter({ ...filter, unit: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="All units" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All units</SelectItem>
                  {(units as any[]).map((unit: any) => (
                    <SelectItem key={unit.id} value={unit.unitId}>
                      {unit.unitId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={filter.status} onValueChange={(value) => setFilter({ ...filter, status: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Incidents List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-sm text-muted-foreground">Loading units...</p>
          </div>
        </div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12">
          <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No active units</p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map(renderIncidentCard)}
        </div>
      )}

      {/* Incident Detail Sheet */}
      {selectedIncident && (
        <Sheet open={!!selectedIncident} onOpenChange={() => setSelectedIncident(null)}>
          <SheetContent side="bottom" className="h-[80vh]">
            <SheetHeader>
              <SheetTitle>Unit {selectedIncident.unitId}</SheetTitle>
              <SheetDescription>
                Incident details and timeline
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div>
                <Label>Status</Label>
                <Badge className={`${selectedIncident.status ? statusColors[selectedIncident.status] || "" : ""} mt-1`}>
                  {statusLabels[selectedIncident.status as keyof typeof statusLabels] || selectedIncident.status}
                </Badge>
              </div>
              
              <div>
                <Label>Location</Label>
                <p className="text-sm mt-1">{selectedIncident.location || "Unknown"}</p>
              </div>
              
              <div>
                <Label>Call Type</Label>
                <p className="text-sm mt-1">{selectedIncident.callType || "Unknown"}</p>
              </div>
              
              <div>
                <Label>Dispatch Time</Label>
                <p className="text-sm mt-1">
                  {format(new Date(selectedIncident.dispatchTime), "HH:mm:ss")}
                </p>
              </div>
              
              {(selectedIncident as any).hospitalDestination && (
                <div>
                  <Label>Hospital Destination</Label>
                  <p className="text-sm mt-1">{(selectedIncident as any).hospitalDestination}</p>
                </div>
              )}
              
              {selectedIncident.editableNotes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-sm mt-1">{selectedIncident.editableNotes}</p>
                </div>
              )}
              
              {selectedIncident.qiFlag && (
                <div>
                  <Badge variant="destructive">QI Review Required</Badge>
                  {selectedIncident.qiResolution && (
                    <p className="text-sm mt-2">{selectedIncident.qiResolution}</p>
                  )}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </MobileLayout>
  );
}