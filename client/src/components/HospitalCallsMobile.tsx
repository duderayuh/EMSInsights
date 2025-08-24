import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { Building2, Clock, Phone, Volume2, ChevronDown, ChevronUp } from "lucide-react";
import { HospitalCall, HospitalCallSegment } from "@shared/schema";
import MobileLayout from "@/components/MobileLayout";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function HospitalCallsMobile() {
  const [expandedCall, setExpandedCall] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch hospital calls
  const { data: hospitalData, isLoading } = useQuery({
    queryKey: ['/api/hospital-calls', { query: searchQuery }],
    refetchInterval: 30000,
  });
  
  const hospitalCalls = hospitalData?.calls || [];

  const renderSegment = (segment: HospitalCallSegment) => (
    <div key={segment.id} className="p-3 bg-muted/50 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {format(new Date(segment.timestamp), "HH:mm:ss")}
        </span>
        {segment.confidence && (
          <Badge variant="outline" className="text-xs">
            {Math.round(segment.confidence * 100)}%
          </Badge>
        )}
      </div>
      <p className="text-sm">{segment.transcript}</p>
      {segment.audioUrl && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 px-2"
          onClick={() => {
            const audio = new Audio(segment.audioUrl);
            audio.play();
          }}
        >
          <Volume2 className="h-3 w-3 mr-1" />
          Play
        </Button>
      )}
    </div>
  );

  const renderCallCard = (call: HospitalCall) => {
    const isExpanded = expandedCall === call.id;
    const segments = (call as any).segments || [];
    
    return (
      <Card key={call.id} className="mb-3">
        <Collapsible
          open={isExpanded}
          onOpenChange={() => setExpandedCall(isExpanded ? null : call.id)}
        >
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-1">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">
                      {call.hospitalName || "Unknown Hospital"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Unit {call.unitNumber || "Unknown"}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(call.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0">
              {/* Call Details */}
              <div className="space-y-3 mb-4">
                {call.patientAge && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Patient Age</span>
                    <span>{call.patientAge}</span>
                  </div>
                )}
                {call.chiefComplaint && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Chief Complaint</span>
                    <span>{call.chiefComplaint}</span>
                  </div>
                )}
                {call.eta && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">ETA</span>
                    <span>{call.eta} minutes</span>
                  </div>
                )}
              </div>
              
              {/* Conversation Segments */}
              {segments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Conversation ({segments.length} segments)
                  </p>
                  <div className="space-y-2">
                    {segments.map(renderSegment)}
                  </div>
                </div>
              )}
              
              {/* Summary if available */}
              {call.summary && (
                <div className="mt-4 p-3 bg-accent/50 rounded-lg">
                  <p className="text-xs font-medium mb-1">Summary</p>
                  <p className="text-sm">{call.summary}</p>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  return (
    <MobileLayout 
      title="Hospital Calls"
      onSearchClick={() => {
        // TODO: Implement search
      }}
    >
      {/* Stats Bar */}
      <div className="mb-4 p-3 bg-background/50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {hospitalCalls.length} Active Calls
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Calls List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-sm text-muted-foreground">Loading calls...</p>
          </div>
        </div>
      ) : hospitalCalls.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No hospital calls</p>
          <p className="text-xs text-muted-foreground mt-2">
            Calls will appear here when units communicate with hospitals
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {hospitalCalls.map(renderCallCard)}
        </div>
      )}
    </MobileLayout>
  );
}