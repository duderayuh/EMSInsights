import { db } from '../db';
import { calls, hospitalCalls, incidents, unitTags, callUnitTags, customHospitals } from '@shared/schema';
import { eq, and, or, desc, gte, lte, like, sql } from 'drizzle-orm';
import type { Incident, InsertIncident, Call, HospitalCall } from '@shared/schema';

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
      // Use raw SQL to avoid Drizzle ORM join issues
      const result = await db.execute(sql`
        SELECT 
          i.id,
          i.unit_id,
          i.dispatch_time,
          i.location,
          i.call_type,
          i.status,
          i.inferred_closest_hospital,
          i.actual_hospital_called,
          i.hospital_destination,
          i.transport_start_time,
          i.eta_given,
          i.eta_estimated,
          i.eta_variance,
          i.qi_flag,
          i.transcript_dispatch_id,
          i.transcript_hospital_id,
          i.latitude,
          i.longitude,
          c.transcript as dispatch_transcript,
          hc.conversation_analysis as hospital_transcript,
          ch.latitude as hospital_latitude,
          ch.longitude as hospital_longitude
        FROM incidents i
        LEFT JOIN calls c ON i.transcript_dispatch_id = c.id
        LEFT JOIN hospital_calls hc ON i.transcript_hospital_id = hc.id
        LEFT JOIN custom_hospitals ch ON ch.hospital_name = i.hospital_destination
        ORDER BY i.dispatch_time DESC
        LIMIT 100
      `);

      const rows = Array.isArray(result) ? result : (result.rows || []);
      
      return rows.map((row: any) => {
        // Calculate actual drive time if we have hospital destination and coordinates
        let calculatedETA = row.eta_estimated;
        let distanceToHospital: number | undefined;
        
        if (row.hospital_destination && row.latitude && row.longitude && row.hospital_latitude && row.hospital_longitude) {
          // Calculate distance using Haversine formula
          distanceToHospital = this.calculateHaversineDistance(
            row.latitude, 
            row.longitude, 
            row.hospital_latitude, 
            row.hospital_longitude
          );
          
          // Calculate ETA based on actual distance
          calculatedETA = this.calculateETA(row.location, distanceToHospital);
        }
        
        return {
          id: row.id,
          unitId: row.unit_id,
          dispatchTime: row.dispatch_time,
          location: row.location,
          callType: row.call_type,
          status: row.status,
          actualHospitalCalled: row.actual_hospital_called,
          hospitalDestination: row.hospital_destination,
          inferredClosestHospital: row.inferred_closest_hospital,
          etaGiven: row.eta_given,
          etaEstimated: calculatedETA,
          distanceToHospital: distanceToHospital ? `${distanceToHospital.toFixed(1)} mi` : null,
          etaVariance: row.eta_variance,
          qiFlag: row.qi_flag,
          dispatchTranscript: row.dispatch_transcript,
          hospitalTranscript: row.hospital_transcript,
          responseTime: row.transport_start_time && row.dispatch_time
            ? Math.round((new Date(row.transport_start_time).getTime() - new Date(row.dispatch_time).getTime()) / 60000)
            : null
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
    // Find related incident based on timestamp and unit
    const timeWindow = 60 * 60 * 1000; // 60 minutes
    const searchStart = new Date(hospitalCall.timestamp!.getTime() - timeWindow);
    const searchEnd = new Date(hospitalCall.timestamp!.getTime() + timeWindow);

    const relatedIncidents = await db.select().from(incidents)
      .where(and(
        gte(incidents.dispatchTime, searchStart),
        lte(incidents.dispatchTime, searchEnd),
        eq(incidents.status, 'dispatched')
      ));

    for (const incident of relatedIncidents) {
      await db.update(incidents)
        .set({
          hospitalCallId: hospitalCall.id,
          hospitalTime: hospitalCall.timestamp!,
          actualArrivalTime: hospitalCall.timestamp!,
          status: 'at_hospital',
          transportStatus: 'at_hospital',
          hospitalDestination: hospitalCall.hospital
        })
        .where(eq(incidents.id, incident.id));
    }
  }
}

export const incidentTracker = new IncidentTracker();