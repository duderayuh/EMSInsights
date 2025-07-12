// Hospital call grouping service to manage 7-10 minute conversation windows
import { HospitalCall, HospitalCallSegment } from '@shared/schema';

export interface CallGroupingResult {
  conversationId: string;
  shouldGroup: boolean;
  reason: string;
  windowStart: Date;
  windowEnd: Date;
}

export class HospitalCallGroupingService {
  private readonly MAX_CONVERSATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private readonly MIN_CONVERSATION_WINDOW_MS = 7 * 60 * 1000;  // 7 minutes

  /**
   * Determine if an audio segment should be grouped with an existing hospital call
   * based on the 7-10 minute time window constraint
   */
  async determineCallGrouping(
    talkgroup: string,
    timestamp: Date,
    existingCalls: HospitalCall[],
    existingSegments: HospitalCallSegment[]
  ): Promise<CallGroupingResult> {
    
    // Filter existing calls for the same talkgroup
    const relevantCalls = existingCalls.filter(call => 
      call.talkgroup === talkgroup && 
      call.status === 'active'
    );

    // Check each active call to see if this segment fits within its time window
    for (const call of relevantCalls) {
      const groupingResult = this.checkTimeWindow(call, timestamp, existingSegments);
      if (groupingResult.shouldGroup) {
        return groupingResult;
      }
    }

    // No existing call found, create new conversation
    return this.createNewConversation(talkgroup, timestamp);
  }

  /**
   * Check if a timestamp fits within an existing call's time window
   */
  private checkTimeWindow(
    call: HospitalCall,
    newTimestamp: Date,
    allSegments: HospitalCallSegment[]
  ): CallGroupingResult {
    
    // Get all segments for this call
    const callSegments = allSegments.filter(seg => seg.hospitalCallId === call.id);
    
    // Determine the actual conversation window based on existing segments
    const segmentTimestamps = callSegments.map(seg => new Date(seg.timestamp));
    segmentTimestamps.push(new Date(call.timestamp)); // Include original call timestamp
    
    const windowStart = new Date(Math.min(...segmentTimestamps.map(t => t.getTime())));
    const windowEnd = new Date(Math.max(...segmentTimestamps.map(t => t.getTime())));
    
    // Check if new timestamp would extend window beyond 10 minutes
    const potentialNewStart = new Date(Math.min(windowStart.getTime(), newTimestamp.getTime()));
    const potentialNewEnd = new Date(Math.max(windowEnd.getTime(), newTimestamp.getTime()));
    const potentialWindowDuration = potentialNewEnd.getTime() - potentialNewStart.getTime();
    
    if (potentialWindowDuration <= this.MAX_CONVERSATION_WINDOW_MS) {
      return {
        conversationId: call.conversationId,
        shouldGroup: true,
        reason: `Fits within ${Math.round(potentialWindowDuration / (60 * 1000))} minute window`,
        windowStart: potentialNewStart,
        windowEnd: potentialNewEnd
      };
    }

    return {
      conversationId: call.conversationId,
      shouldGroup: false,
      reason: `Would exceed 10 minute limit (${Math.round(potentialWindowDuration / (60 * 1000))} minutes)`,
      windowStart,
      windowEnd
    };
  }

  /**
   * Create a new conversation ID for a new hospital call
   */
  private createNewConversation(talkgroup: string, timestamp: Date): CallGroupingResult {
    const dateStr = timestamp.toISOString().split('T')[0];
    const timeStr = timestamp.toISOString().split('T')[1].split('.')[0].replace(/:/g, '');
    const conversationId = `CONV-${dateStr}-${talkgroup}-${timeStr}`;
    
    return {
      conversationId,
      shouldGroup: false,
      reason: 'New conversation started',
      windowStart: timestamp,
      windowEnd: timestamp
    };
  }

  /**
   * Validate that all segments in a hospital call fall within the time constraint
   */
  validateConversationTimeWindow(segments: HospitalCallSegment[]): {
    isValid: boolean;
    actualDuration: number;
    violationsCount: number;
  } {
    if (segments.length === 0) {
      return { isValid: true, actualDuration: 0, violationsCount: 0 };
    }

    const timestamps = segments.map(seg => new Date(seg.timestamp).getTime());
    const windowStart = Math.min(...timestamps);
    const windowEnd = Math.max(...timestamps);
    const actualDuration = windowEnd - windowStart;

    const isValid = actualDuration <= this.MAX_CONVERSATION_WINDOW_MS;
    const violationsCount = isValid ? 0 : 1;

    return {
      isValid,
      actualDuration,
      violationsCount
    };
  }

  /**
   * Split an existing call if it exceeds the time window
   */
  suggestCallSplit(segments: HospitalCallSegment[]): {
    shouldSplit: boolean;
    splitGroups: HospitalCallSegment[][];
    reason: string;
  } {
    if (segments.length < 2) {
      return {
        shouldSplit: false,
        splitGroups: [segments],
        reason: 'Insufficient segments for splitting'
      };
    }

    // Sort segments by timestamp
    const sortedSegments = [...segments].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const groups: HospitalCallSegment[][] = [];
    let currentGroup: HospitalCallSegment[] = [sortedSegments[0]];
    let groupStartTime = new Date(sortedSegments[0].timestamp).getTime();

    for (let i = 1; i < sortedSegments.length; i++) {
      const segment = sortedSegments[i];
      const segmentTime = new Date(segment.timestamp).getTime();
      const groupDuration = segmentTime - groupStartTime;

      if (groupDuration <= this.MAX_CONVERSATION_WINDOW_MS) {
        // Fits in current group
        currentGroup.push(segment);
      } else {
        // Start new group
        groups.push(currentGroup);
        currentGroup = [segment];
        groupStartTime = segmentTime;
      }
    }
    
    // Add final group
    groups.push(currentGroup);

    return {
      shouldSplit: groups.length > 1,
      splitGroups: groups,
      reason: groups.length > 1 
        ? `Split into ${groups.length} conversations to maintain 10-minute limit`
        : 'No split needed - within time constraints'
    };
  }
}

export const hospitalCallGroupingService = new HospitalCallGroupingService();