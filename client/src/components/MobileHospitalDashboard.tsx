import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PhoneCall, Hospital, Clock, FileText, Headphones, Link, Trash2, Filter, Eye, Play, Pause } from "lucide-react";
import { HospitalCall, HospitalCallSegment } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MobileHospitalDashboardProps {
  onCallSelect?: (call: HospitalCall) => void;
}

export function MobileHospitalDashboard({ onCallSelect }: MobileHospitalDashboardProps) {
  const [selectedCall, setSelectedCall] = useState<HospitalCall | null>(null);
  const [hospitalFilter, setHospitalFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("active");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch hospital calls with filtering
  const { data: hospitalCalls = [], isLoading } = useQuery({
    queryKey: ['/api/hospital-calls', { hospitalFilter }],
    refetchInterval: 5000,
  });

  // Fetch segments for selected call
  const { data: callSegments = [] } = useQuery({
    queryKey: [`/api/hospital-calls/${selectedCall?.id}/segments`],
    enabled: !!selectedCall?.id,
  });

  // Delete hospital call mutation
  const deleteCallMutation = useMutation({
    mutationFn: async (callId: number) => {
      await apiRequest(`/api/hospital-calls/${callId}`, 'DELETE');
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Hospital call deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-calls'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete hospital call",
        variant: "destructive",
      });
    },
  });

  const activeCalls = hospitalCalls.filter((call: any) => call.status === 'active');
  const completedCalls = hospitalCalls.filter((call: any) => call.status === 'completed');
  const sorRequests = hospitalCalls.filter((call: any) => call.sorDetected);

  const handleCallSelect = (call: HospitalCall) => {
    setSelectedCall(call);
    setDetailsOpen(true);
    onCallSelect?.(call);
  };

  const renderMobileCallCard = (call: any) => (
    <Card key={call.id} className="mb-3">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Hospital className="h-4 w-4 text-blue-600" />
            {call.hospitalName || `Talkgroup ${call.talkgroup}`}
          </CardTitle>
          <div className="flex gap-1">
            {call.sorDetected && (
              <Badge variant="destructive" className="text-xs">SOR</Badge>
            )}
            <Badge variant={call.status === 'active' ? 'default' : 'secondary'} className="text-xs">
              {call.status || 'unknown'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-3">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(new Date(call.timestamp), { addSuffix: true })}
          <span>•</span>
          <span>{call.totalSegments || 0} segments</span>
        </div>
        
        <div className="flex flex-wrap gap-1">
          <Button 
            size="sm" 
            variant="outline" 
            className="text-xs h-7"
            onClick={() => handleCallSelect(call)}
          >
            <Eye className="h-3 w-3 mr-1" />
            View
          </Button>
          <Button 
            size="sm" 
            variant="destructive" 
            className="text-xs h-7"
            disabled={deleteCallMutation.isPending}
            onClick={() => {
              if (confirm('Delete this call?')) {
                deleteCallMutation.mutate(call.id);
              }
            }}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Del
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderTabContent = () => {
    let calls = [];
    switch (activeTab) {
      case 'active':
        calls = activeCalls;
        break;
      case 'completed':
        calls = completedCalls;
        break;
      case 'sor':
        calls = sorRequests;
        break;
      default:
        calls = activeCalls;
    }

    if (calls.length === 0) {
      return (
        <div className="text-center py-8">
          <PhoneCall className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-sm text-gray-600 dark:text-gray-400">No calls found</p>
        </div>
      );
    }

    return calls.map(renderMobileCallCard);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header with filter */}
      <div className="mb-4">
        <h1 className="text-lg font-bold mb-2">EMS-Hospital Calls</h1>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Filter by hospital" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Hospitals</SelectItem>
              <SelectItem value="Methodist">Methodist</SelectItem>
              <SelectItem value="Riley">Riley</SelectItem>
              <SelectItem value="Eskenazi">Eskenazi</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-2 mb-4">
        <Button 
          size="sm" 
          variant={activeTab === 'active' ? 'default' : 'outline'}
          onClick={() => setActiveTab('active')}
          className="flex-1"
        >
          Active ({activeCalls.length})
        </Button>
        <Button 
          size="sm" 
          variant={activeTab === 'completed' ? 'default' : 'outline'}
          onClick={() => setActiveTab('completed')}
          className="flex-1"
        >
          Done ({completedCalls.length})
        </Button>
        <Button 
          size="sm" 
          variant={activeTab === 'sor' ? 'default' : 'outline'}
          onClick={() => setActiveTab('sor')}
          className="flex-1"
        >
          SOR ({sorRequests.length})
        </Button>
      </div>

      {/* Call list */}
      <ScrollArea className="flex-1">
        {renderTabContent()}
      </ScrollArea>

      {/* Call details sheet */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="bottom" className="h-[80vh]">
          <SheetHeader>
            <SheetTitle>
              {selectedCall?.hospitalName || `Talkgroup ${selectedCall?.talkgroup}`}
            </SheetTitle>
            <SheetDescription>
              {selectedCall && formatDistanceToNow(new Date(selectedCall.timestamp), { addSuffix: true })}
            </SheetDescription>
          </SheetHeader>
          
          <ScrollArea className="h-full mt-4">
            {callSegments.length > 0 ? (
              <div className="space-y-3">
                {callSegments.map((segment: HospitalCallSegment) => (
                  <Card key={segment.id} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-gray-600">
                        Segment {segment.sequenceNumber}
                      </div>
                      <div className="text-xs text-gray-600">
                        {segment.confidence && `${Math.round(segment.confidence * 100)}%`}
                      </div>
                    </div>
                    <p className="text-sm mb-2">{segment.transcript}</p>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="text-xs h-6">
                        <Play className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-sm text-gray-600">No segments available</p>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}