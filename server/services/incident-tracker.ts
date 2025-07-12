import { db } from '../db';
import { calls, hospitalCalls, incidents, unitTags, callUnitTags, customHospitals } from '@shared/schema';
import { eq, and, or, desc, gte, lte, like, sql } from 'drizzle-orm';
import type { Incident, InsertIncident, Call, HospitalCall } from '@shared/schema';
import { googleMapsDistance } from './google-maps-distance';
import { getHospitalInfo } from './hospital-talkgroup-mapping';

export class IncidentTracker {
  
  /**
   * Creates incidents by linking dispatch calls with hospital communications from past 24 hours
   * based on unit information, timestamps, and call types
   */
  async createIncidentsFromExistingData(): Promise<void> {
    console.log('Starting incident creation from past 24 hours data...');
    
    // Clear existing incidents to avoid duplicates
    await db.delete(incidents);
    
    // Get dispatch calls from past 24 hours with unit information
    const dispatchCalls = await db.select().from(calls)
      .where(and(
        eq(calls.talkgroup, '10202'), // Primary dispatch channel
        gte(calls.timestamp, sql`NOW() - INTERVAL '24 hours'`),
        or(
          sql`${calls.transcript} ILIKE '%medic%'`,
          sql`${calls.transcript} ILIKE '%ambulance%'`,
          sql`${calls.transcript} ILIKE '%engine%'`,
          sql`${calls.transcript} ILIKE '%ems%'`
        )
      ))
      .orderBy(desc(calls.timestamp));
    
    console.log(`Found ${dispatchCalls.length} dispatch calls from past 24 hours`);

    // Get hospital calls from past 24 hours
    const hospitalComms = await db.select().from(hospitalCalls)
      .where(gte(hospitalCalls.timestamp, sql`NOW() - INTERVAL '24 hours'`))
      .orderBy(desc(hospitalCalls.timestamp));
    
    console.log(`Found ${hospitalComms.length} hospital communications from past 24 hours`);

    let incidentsCreated = 0;

    for (const dispatchCall of dispatchCalls) {
      const unitInfo = this.extractUnitFromTranscript(dispatchCall.transcript);
      if (!unitInfo) continue;

      // Find corresponding hospital communications within 60 minutes
      const timeWindow = 60 * 60 * 1000; // 60 minutes in milliseconds
      const searchStart = new Date(dispatchCall.timestamp!.getTime());
      const searchEnd = new Date(dispatchCall.timestamp!.getTime() + timeWindow);

      const relatedHospitalCalls = hospitalComms.filter(hc => 
        hc.timestamp >= searchStart && 
        hc.timestamp <= searchEnd &&
        (
          hc.transcript?.toLowerCase().includes(unitInfo.toLowerCase()) ||
          hc.transcript?.toLowerCase().includes('medic') ||
          hc.transcript?.toLowerCase().includes('ambulance') ||
          hc.transcript?.toLowerCase().includes('ems')
        )
      );

      if (relatedHospitalCalls.length > 0) {
        // Create incident
        const incident: InsertIncident = {
          unitId: unitInfo,
          dispatchCallId: dispatchCall.id,
          hospitalCallId: relatedHospitalCalls[0].id,
          dispatchTime: dispatchCall.timestamp!,
          hospitalTime: relatedHospitalCalls[0].timestamp!,
          callType: dispatchCall.callType || 'Medical Emergency',
          location: dispatchCall.location || 'Unknown',
          status: 'completed',
          priority: this.determinePriority(dispatchCall.callType),
          estimatedETA: this.calculateETA(dispatchCall.location),
          actualArrivalTime: relatedHospitalCalls[0].timestamp!,
          transportStatus: 'transported',
          hospitalDestination: relatedHospitalCalls[0].hospital || 'Unknown Hospital',
          qiFlag: false,
          notes: `Auto-linked dispatch call ${dispatchCall.id} with hospital call ${relatedHospitalCalls[0].id}`,
          latitude: dispatchCall.latitude,
          longitude: dispatchCall.longitude
        };

        await db.insert(incidents).values(incident);
        incidentsCreated++;
      } else {
        // Create incident for dispatch call without hospital link
        const incident: InsertIncident = {
          unitId: unitInfo,
          dispatchCallId: dispatchCall.id,
          dispatchTime: dispatchCall.timestamp!,
          callType: dispatchCall.callType || 'Medical Emergency',
          location: dispatchCall.location || 'Unknown',
          status: 'dispatched',
          priority: this.determinePriority(dispatchCall.callType),
          estimatedETA: this.calculateETA(dispatchCall.location),
          transportStatus: 'en_route',
          qiFlag: false,
          notes: `Dispatch call ${dispatchCall.id} - no hospital communication found`,
          latitude: dispatchCall.latitude,
          longitude: dispatchCall.longitude
        };

        await db.insert(incidents).values(incident);
        incidentsCreated++;
      }
    }

    console.log(`Created ${incidentsCreated} incidents from past 24 hours data`);
  }

  /**
   * Extracts unit information from transcript
   */
  private extractUnitFromTranscript(transcript: string): string | null {
    const unitPatterns = [
      /(?:medic|ambulance|ems)\s+(\d+)/i,
      /(?:engine|squad|truck)\s+(\d+)/i,
      /unit\s+(\d+)/i
    ];

    for (const pattern of unitPatterns) {
      const match = transcript.match(pattern);
      if (match) {
        return match[0]; // Return the full match (e.g., "Medic 26")
      }
    }
    return null;
  }

  /**
   * Determines priority based on call type
   */
  private determinePriority(callType: string | null): 'low' | 'medium' | 'high' | 'critical' {
    if (!callType) return 'medium';
    
    const lowPriority = ['investigation', 'welfare check', 'sick person'];
    const highPriority = ['trauma', 'mvc', 'cardiac arrest', 'overdose'];
    const criticalPriority = ['cardiac arrest', 'gsw', 'major trauma'];
    
    const type = callType.toLowerCase();
    
    if (criticalPriority.some(p => type.includes(p))) return 'critical';
    if (highPriority.some(p => type.includes(p))) return 'high';
    if (lowPriority.some(p => type.includes(p))) return 'low';
    
    return 'medium';
  }

  /**
   * Calculates estimated ETA based on location or distance to hospital
   */
  private calculateETA(location: string | null, distanceInMiles?: number): number {
    // If we have distance to hospital, calculate based on average ambulance speed
    if (distanceInMiles !== undefined && distanceInMiles >= 0) {
      // Average ambulance speeds:
      // Urban: 35-40 mph (accounting for traffic and signals)
      // Highway: 50-60 mph
      // We'll use a weighted average of 40 mph for mixed conditions
      const averageSpeedMph = 40;
      const driveTimeMinutes = (distanceInMiles / averageSpeedMph) * 60;
      
      // Add 2 minutes for patient loading/unloading
      return Math.round(driveTimeMinutes + 2);
    }
    
    // Default ETA in minutes based on location type
    if (!location) return 8;
    
    const locationLower = location.toLowerCase();
    
    if (locationLower.includes('i-') || locationLower.includes('interstate')) return 12;
    if (locationLower.includes('downtown')) return 6;
    if (locationLower.includes('residential')) return 10;
    
    return 8; // Default ETA
  }

  /**
   * Gets real-time incident updates by linking new calls as they come in
   */
  async processNewCall(call: Call): Promise<void> {
    // Check if this is a dispatch call that should create an incident
    if ((call.talkgroup === '10202' || call.talkgroup === '10244') && call.transcript) {
      console.log(`Processing dispatch call ${call.id} from talkgroup ${call.talkgroup}: ${call.transcript.substring(0, 100)}`);
      const unitInfo = this.extractUnitFromTranscript(call.transcript);
      console.log(`Extracted unit info: ${unitInfo}`);
      if (unitInfo) {
        const incident: InsertIncident = {
          unitId: unitInfo,
          dispatchCallId: call.id,
          dispatchTime: call.timestamp!,
          callType: call.callType || 'Medical Emergency',
          location: call.location || 'Unknown',
          status: 'dispatched',
          priority: this.determinePriority(call.callType),
          estimatedETA: this.calculateETA(call.location),
          transportStatus: 'en_route',
          qiFlag: false,
          latitude: call.latitude,
          longitude: call.longitude
        };

        const [newIncident] = await db.insert(incidents).values(incident).returning();
        console.log(`Created new incident for unit ${unitInfo}`);
        
        // Broadcast the new incident via WebSocket (only if websocket service is available)
        try {
          const websocket = (await import('./websocket')).websocketService;
          if (websocket && websocket.broadcast) {
            websocket.broadcast({
              type: 'incident_created',
              incident: newIncident
            });
          }
        } catch (error) {
          console.log('WebSocket not available for broadcasting');
        }
      }
    }
  }

  /**
   * Gets incidents with enhanced data for dashboard display
   */
  async getEnhancedIncidents(): Promise<any[]> {
    try {
      // First, let's check if we have any incidents at all
      const incidentCount = await db.execute(sql`SELECT COUNT(*) as count FROM incidents`);
      console.log('Total incidents in database:', incidentCount);
      
      // If no incidents, return empty array
      if (Array.isArray(incidentCount) && incidentCount.length > 0) {
        const count = incidentCount[0]?.count || 0;
        if (count === 0) {
          console.log('No incidents found in database');
          return [];
        }
      }
      
      // Use simple select to avoid column issues
      const incidentRecords = await db.select()
        .from(incidents)
        .orderBy(desc(incidents.dispatchTime))
        .limit(100);
      
      console.log('Found incidents:', incidentRecords.length);
      
      return incidentRecords.map((row: any) => {
        // Calculate response time if we have both dispatch and transport times
        let responseTimeMinutes = null;
        if (row.dispatchTime && row.transportStartTime) {
          const dispatch = new Date(row.dispatchTime);
          const transport = new Date(row.transportStartTime);
          responseTimeMinutes = Math.round((transport.getTime() - dispatch.getTime()) / (1000 * 60));
        }
        
        return {
          id: row.id,
          unitId: row.unitId,
          dispatchTime: row.dispatchTime,
          location: row.location,
          callType: row.callType,
          status: row.status,
          hospitalCalled: row.actualHospitalCalled,
          inferredHospital: row.inferredClosestHospital,
          etaGiven: row.etaGiven,
          etaEstimated: row.etaEstimated,
          responseTime: responseTimeMinutes,
          latitude: row.latitude,
          longitude: row.longitude,
          hospitalDestination: row.hospitalDestination,
          qiFlag: row.qiFlag,
          // For backward compatibility
          dispatchCallId: row.dispatchCallId,
          hospitalCallId: row.hospitalCallId
        };
      });
    } catch (error) {
      console.error('Error in getEnhancedIncidents:', error);
      throw error;
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Radius of the Earth in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  }

  /**
   * Updates incident status based on hospital communications
   */
  async updateIncidentFromHospitalCall(hospitalCall: HospitalCall): Promise<void> {
    console.log(`Processing hospital call ${hospitalCall.id} for incident updates`);
    
    // Extract unit from hospital call transcript
    if (!hospitalCall.transcript) {
      console.log('No transcript available for hospital call');
      return;
    }
    
    const unitInfo = this.extractUnitFromTranscript(hospitalCall.transcript);
    if (!unitInfo) {
      console.log('No unit found in hospital call transcript');
      return;
    }
    
    console.log(`Found unit ${unitInfo} in hospital call transcript`);
    
    // Find related incident based on unit and recent dispatch time
    const timeWindow = 60 * 60 * 1000; // 60 minutes
    const searchStart = new Date(hospitalCall.timestamp!.getTime() - timeWindow);
    const searchEnd = hospitalCall.timestamp!;

    const relatedIncidents = await db.select().from(incidents)
      .where(and(
        eq(incidents.unitId, unitInfo),
        gte(incidents.dispatchTime, searchStart),
        lte(incidents.dispatchTime, searchEnd),
        or(
          eq(incidents.status, 'dispatched'),
          eq(incidents.status, 'en_route')
        )
      ));

    if (relatedIncidents.length === 0) {
      console.log(`No dispatched incidents found for unit ${unitInfo} within time window`);
      return;
    }

    // Get hospital info from talkgroup
    const hospitalInfo = getHospitalInfo(hospitalCall.talkgroup!);
    if (!hospitalInfo || !hospitalInfo.address) {
      console.log('No hospital info or address found for talkgroup', hospitalCall.talkgroup);
      return;
    }

    for (const incident of relatedIncidents) {
      console.log(`Updating incident ${incident.id} for unit ${unitInfo}`);
      
      // Calculate distance and ETA if we have coordinates
      let distanceInMiles: number | null = null;
      let estimatedETA: number | null = null;
      
      if (incident.latitude && incident.longitude && hospitalInfo.address) {
        const distanceResult = await googleMapsDistance.calculateDistance(
          incident.latitude,
          incident.longitude,
          hospitalInfo.address
        );
        
        if (distanceResult) {
          distanceInMiles = distanceResult.distanceInMiles;
          estimatedETA = distanceResult.durationInMinutes;
          console.log(`Calculated distance: ${distanceInMiles} miles, ETA: ${estimatedETA} minutes`);
        }
      }

      // Update incident with en_route status
      const [updatedIncident] = await db.update(incidents)
        .set({
          hospitalCallId: hospitalCall.id,
          transportStartTime: hospitalCall.timestamp!,
          status: 'en_route',
          transportStatus: 'transporting',
          hospitalDestination: hospitalInfo.hospitalName,
          actualHospitalCalled: hospitalInfo.hospitalName,
          estimatedETA: estimatedETA || this.calculateETA(incident.location, distanceInMiles),
          notes: `Unit ${unitInfo} called ${hospitalInfo.hospitalName} at ${hospitalCall.timestamp}. Distance: ${distanceInMiles?.toFixed(1) || 'Unknown'} miles`
        })
        .where(eq(incidents.id, incident.id))
        .returning();
      
      console.log(`Updated incident ${incident.id} to en_route status with hospital destination ${hospitalInfo.hospitalName}`);
      
      // Broadcast the update via WebSocket
      try {
        const websocket = (await import('./websocket')).websocketService;
        if (websocket && websocket.broadcast) {
          websocket.broadcast({
            type: 'incident_updated',
            incident: updatedIncident
          });
          console.log('Broadcasted incident update via WebSocket');
        }
      } catch (error) {
        console.log('WebSocket not available for broadcasting');
      }
    }
  }
}

export const incidentTracker = new IncidentTracker();