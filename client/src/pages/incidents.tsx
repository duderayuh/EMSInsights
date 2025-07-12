import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { MapPin, Clock, AlertTriangle, Link2, Plus, Edit, Search, Filter, Wifi, WifiOff } from "lucide-react";
import type { Incident } from "@shared/schema";
import { useIncidentWebSocket } from "@/hooks/useIncidentWebSocket";

export default function IncidentsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState({ unit: "all", status: "all" });
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((message: any) => {
    console.log('Incident page received WebSocket message:', message.type, message);
    
    if (message.type === 'incident_created' || message.type === 'incident_updated') {
      // Invalidate and refetch incidents when updates are received
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/enhanced"] });
      
      if (message.type === 'incident_created') {
        toast({
          title: "New Incident",
          description: `Unit ${message.data.unitId} dispatched to ${message.data.location}`,
        });
      }
    }
  }, [toast]);

  // WebSocket connection for live updates
  const { isConnected } = useIncidentWebSocket('/ws/incidents', handleWebSocketMessage);

  // Fetch enhanced incidents with linked dispatch/hospital data
  const { data: incidents = [], isLoading, error } = useQuery({
    queryKey: ["/api/incidents/enhanced", filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter.unit && filter.unit !== "all") params.append("unit", filter.unit);
      if (filter.status && filter.status !== "all") params.append("status", filter.status);
      const response = await apiRequest("GET", `/api/incidents/enhanced?${params}`);
      const data = await response.json();
      return data || [];
    },
    // Enable auto-refresh every 30 seconds
    refetchInterval: 30000,
  });

  // Fetch units for dropdown
  const { data: units = [] } = useQuery({
    queryKey: ["/api/unit-tags/active"]
  });

  // Create incident mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Incident>) => {
      const response = await apiRequest("POST", "/api/incidents", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/enhanced"] });
      setIsCreateOpen(false);
      toast({ title: "Incident created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create incident", variant: "destructive" });
    }
  });

  // Update incident mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Incident> }) => {
      const response = await apiRequest("PATCH", `/api/incidents/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/enhanced"] });
      setIsEditOpen(false);
      toast({ title: "Incident updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update incident", variant: "destructive" });
    }
  });

  // Create incidents from existing data mutation
  const createIncidentsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/incidents/create-from-data");
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents/enhanced"] });
      toast({
        title: "Success",
        description: "Incidents created from existing dispatch and hospital data",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create incidents from data",
        variant: "destructive",
      });
    }
  });

  const statusColors = {
    dispatched: "bg-yellow-500/20 text-yellow-600",
    enroute: "bg-blue-500/20 text-blue-600",
    en_route: "bg-blue-500/20 text-blue-600",
    on_scene: "bg-orange-500/20 text-orange-600",
    transporting: "bg-purple-500/20 text-purple-600",
    arriving_shortly: "bg-indigo-500/20 text-indigo-600",
    at_hospital: "bg-green-500/20 text-green-600",
    completed: "bg-gray-500/20 text-gray-600"
  };

  const statusLabels = {
    dispatched: "Dispatched",
    enroute: "En Route",
    en_route: "En Route",
    on_scene: "On Scene",
    transporting: "Transporting",
    arriving_shortly: "Arriving Shortly",
    at_hospital: "At Hospital",
    completed: "Completed"
  };

  const handleCreateIncident = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    createMutation.mutate({
      unitId: formData.get("unitId") as string,
      dispatchTime: new Date(formData.get("dispatchTime") as string),
      location: formData.get("location") as string,
      callType: formData.get("callType") as string,
      status: formData.get("status") as string,
      editableNotes: formData.get("notes") as string
    });
  };

  const handleUpdateIncident = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedIncident) return;
    
    const formData = new FormData(e.currentTarget);
    
    updateMutation.mutate({
      id: selectedIncident.id,
      data: {
        status: formData.get("status") as string,
        actualHospitalCalled: formData.get("actualHospitalCalled") as string,
        transportStartTime: formData.get("transportStartTime") ? new Date(formData.get("transportStartTime") as string) : undefined,
        etaGiven: formData.get("etaGiven") ? parseInt(formData.get("etaGiven") as string) : undefined,
        editableNotes: formData.get("notes") as string,
        qiFlag: formData.get("qiFlag") === "on",
        qiResolution: formData.get("qiResolution") as string
      }
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">Unit Tracking & QI Dashboard</h1>
          <div className="flex items-center gap-2 text-sm">
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-green-600 dark:text-green-400">Live Updates</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500">Connecting...</span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => createIncidentsMutation.mutate()}
            disabled={createIncidentsMutation.isPending}
            variant="outline"
          >
            <Link2 className="h-4 w-4 mr-2" />
            {createIncidentsMutation.isPending ? "Creating..." : "Create from Data"}
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Incident
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <Label>Unit</Label>
            <Select value={filter.unit} onValueChange={(value) => setFilter({ ...filter, unit: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All units" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All units</SelectItem>
                {units.map((unit: any) => (
                  <SelectItem key={unit.id} value={unit.unitId}>
                    {unit.unitId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
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
        </CardContent>
      </Card>

      {/* Incidents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading incidents...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">Error loading incidents: {error.message}</div>
          ) : !Array.isArray(incidents) || incidents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No incidents found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Dispatch Time</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Call Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Response Time</TableHead>
                  <TableHead>Hospital</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>QI Flag</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.isArray(incidents) && incidents.map((incident: Incident) => (
                  <TableRow key={incident.id}>
                    <TableCell className="font-medium">{incident.unitId}</TableCell>
                    <TableCell>{format(new Date(incident.dispatchTime), "HH:mm:ss")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {incident.location}
                      </div>
                    </TableCell>
                    <TableCell>{incident.callType || "Unknown"}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[incident.status] || ""}>
                        {statusLabels[incident.status as keyof typeof statusLabels] || incident.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {(incident as any).responseTime 
                          ? `${(incident as any).responseTime} min` 
                          : "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {incident.hospitalDestination || incident.actualHospitalCalled || incident.inferredClosestHospital || "-"}
                        {(incident as any).distanceToHospital && (
                          <div className="text-xs text-gray-500">
                            ({(incident as any).distanceToHospital})
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {incident.estimatedETA ? (
                        <div>
                          <span>{incident.estimatedETA} min</span>
                          {(incident as any).distanceToHospital && (
                            <div className="text-xs text-gray-500">Drive time</div>
                          )}
                        </div>
                      ) : incident.etaGiven ? (
                        `${incident.etaGiven} min`
                      ) : (
                        "-"
                      )}
                      {incident.etaVariance && incident.etaVariance !== 0 && (
                        <span className={incident.etaVariance > 0 ? "text-red-500" : "text-green-500"}>
                          {" "}({incident.etaVariance > 0 ? "+" : ""}{incident.etaVariance})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {incident.qiFlag && (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedIncident(incident);
                          setIsEditOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Incident Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Incident</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateIncident}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="unitId">Unit ID</Label>
                <Input id="unitId" name="unitId" required />
              </div>
              <div>
                <Label htmlFor="dispatchTime">Dispatch Time</Label>
                <Input
                  id="dispatchTime"
                  name="dispatchTime"
                  type="datetime-local"
                  defaultValue={new Date().toISOString().slice(0, 16)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="location">Location</Label>
                <Input id="location" name="location" required />
              </div>
              <div>
                <Label htmlFor="callType">Call Type</Label>
                <Input id="callType" name="callType" />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue="dispatched">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Create Incident
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Incident Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Incident - {selectedIncident?.unitId}</DialogTitle>
          </DialogHeader>
          {selectedIncident && (
            <form onSubmit={handleUpdateIncident}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select name="status" defaultValue={selectedIncident.status}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="actualHospitalCalled">Hospital Called</Label>
                    <Input
                      id="actualHospitalCalled"
                      name="actualHospitalCalled"
                      defaultValue={selectedIncident.actualHospitalCalled || ""}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="transportStartTime">Transport Start Time</Label>
                    <Input
                      id="transportStartTime"
                      name="transportStartTime"
                      type="datetime-local"
                      defaultValue={selectedIncident.transportStartTime ? 
                        new Date(selectedIncident.transportStartTime).toISOString().slice(0, 16) : ""}
                    />
                  </div>
                  <div>
                    <Label htmlFor="etaGiven">ETA Given (minutes)</Label>
                    <Input
                      id="etaGiven"
                      name="etaGiven"
                      type="number"
                      defaultValue={selectedIncident.etaGiven || ""}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    rows={4}
                    defaultValue={selectedIncident.editableNotes || ""}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="qiFlag"
                      name="qiFlag"
                      defaultChecked={selectedIncident.qiFlag}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="qiFlag">QI Flag</Label>
                  </div>
                  <div>
                    <Label htmlFor="qiResolution">QI Resolution</Label>
                    <Textarea
                      id="qiResolution"
                      name="qiResolution"
                      rows={2}
                      defaultValue={selectedIncident.qiResolution || ""}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}