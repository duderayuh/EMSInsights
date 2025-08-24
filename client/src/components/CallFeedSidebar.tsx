import { Search, Filter, ExternalLink, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Call } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";

interface CallFeedSidebarProps {
  calls: Call[];
  onCallSelect: (call: Call) => void;
  onSearch: (query: string) => void;
  onPriorityFilter: (priority: string) => void;
  isLoading: boolean;
  newCallIds: Set<number>;
}

interface EnhancedCall extends Call {
  talkgroupDescription?: string;
  talkgroupDisplayName?: string;
}

export function CallFeedSidebar({ 
  calls, 
  onCallSelect, 
  onSearch, 
  onPriorityFilter, 
  isLoading,
  newCallIds 
}: CallFeedSidebarProps) {
  
  const getTalkgroupColor = (talkgroup: string) => {
    // Match talkgroup categories to colors
    if (talkgroup === '10202' || talkgroup === '10244') {
      return "bg-blue-600 text-white"; // Dispatch channels
    } else if (talkgroup?.startsWith('1021')) {
      return "bg-red-600 text-white"; // Fire channels
    } else if (talkgroup?.startsWith('1022')) {
      return "bg-green-600 text-white"; // EMS channels
    } else if (talkgroup?.startsWith('1023')) {
      return "bg-orange-600 text-white"; // Police channels
    } else if (talkgroup?.startsWith('1025')) {
      return "bg-purple-600 text-white"; // Interop channels
    } else {
      return "bg-gray-500 text-white"; // Default
    }
  };

  const getTalkgroupBorderColor = (talkgroup: string) => {
    // Match talkgroup categories to border colors
    if (talkgroup === '10202' || talkgroup === '10244') {
      return "border-blue-600"; // Dispatch channels
    } else if (talkgroup?.startsWith('1021')) {
      return "border-red-600"; // Fire channels
    } else if (talkgroup?.startsWith('1022')) {
      return "border-green-600"; // EMS channels
    } else if (talkgroup?.startsWith('1023')) {
      return "border-orange-600"; // Police channels
    } else if (talkgroup?.startsWith('1025')) {
      return "border-purple-600"; // Interop channels
    } else {
      return "border-gray-400"; // Default
    }
  };

  // Sort calls by timestamp (newest first) for real-time updates
  const sortedCalls = [...calls].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  
  const activeCalls = sortedCalls.filter(call => call.status === 'active');
  const recentCalls = sortedCalls.filter(call => call.status === 'cleared').slice(0, 10);

  return (
    <aside className="w-96 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      {/* Search and Filters */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search calls, locations, or keywords..."
            className="pl-10"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        
        <div className="flex space-x-2">
          <Select defaultValue="10202" onValueChange={onPriorityFilter}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Countywide Dispatch Primary" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="10202">Countywide Dispatch Primary (10202)</SelectItem>
              <SelectItem value="10244">Countywide Dispatch Secondary (10244)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4 overflow-hidden">
          
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg max-w-[354px]">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          ) : activeCalls.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {calls.length === 0 ? "No calls found" : "No active calls"}
            </p>
          ) : (
            <div className="space-y-3 max-w-full">
              {activeCalls.map((call) => {
                const enhancedCall = call as EnhancedCall;
                const talkgroupDisplay = enhancedCall.talkgroupDescription || enhancedCall.talkgroup || 'Unknown Channel';
                
                const isNewCall = newCallIds.has(call.id);
                
                return (
                  <div
                    key={call.id}
                    className={`p-3 bg-gray-100 dark:bg-gray-700 rounded-lg border-l-4 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-all overflow-hidden max-w-[354px] ${getTalkgroupBorderColor(call.talkgroup || '')} ${isNewCall ? 'animate-pulse bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-300 dark:ring-blue-600' : ''}`}
                    onClick={() => onCallSelect(call)}
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <Badge className={`text-xs font-medium truncate max-w-[200px] ${getTalkgroupColor(call.talkgroup || '')}`}>
                        {talkgroupDisplay}
                      </Badge>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap flex-shrink-0">
                        <div>📻 {call.radioTimestamp ? formatDistanceToNow(new Date(call.radioTimestamp), { addSuffix: true }) : formatDistanceToNow(new Date(call.timestamp), { addSuffix: true })}</div>
                        {call.radioTimestamp && <div className="text-gray-400">⚙️ {formatDistanceToNow(new Date(call.timestamp), { addSuffix: true })}</div>}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                      {call.callType || 'Unknown'}
                    </div>
                    {call.units && call.units.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {call.units.map((unit: any) => (
                          <Badge 
                            key={unit.id} 
                            variant="secondary"
                            className="text-xs"
                            style={{ 
                              backgroundColor: unit.color || '#3B82F6', 
                              color: '#ffffff',
                              border: 'none'
                            }}
                          >
                            {unit.displayName}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {call.location && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 mb-2 truncate">
                        {call.location}
                      </div>
                    )}
                    <div className="text-xs text-gray-700 dark:text-gray-200 line-clamp-2">
                      {call.transcript && call.transcript.trim() !== '' ? 
                        call.transcript : 
                        <span className="italic text-orange-600 dark:text-orange-400">
                          Active Call in Progress, Transcription Pending
                        </span>
                      }
                    </div>
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        Transcription Confidence: {Math.round((call.confidence || 0) * 100)}%
                      </span>
                      <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:text-blue-800 flex-shrink-0">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Details
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>


      </ScrollArea>
    </aside>
  );
}