import { db } from '../db';
import { incidents } from '@shared/schema';
import { eq, and, or, lte, gte, ne, sql, isNotNull } from 'drizzle-orm';
import type { Incident } from '@shared/schema';

export class IncidentStatusMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

  start() {
    console.log('Starting incident status monitor...');
    
    // Run immediately on start
    this.checkAndUpdateStatuses();
    
    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAndUpdateStatuses();
    }, this.CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Incident status monitor stopped');
    }
  }

  private async checkAndUpdateStatuses() {
    try {
      const now = new Date();
      
      // Find incidents that are en_route and have an estimated ETA
      const enRouteIncidents = await db.select().from(incidents)
        .where(and(
          eq(incidents.status, 'en_route'),
          isNotNull(incidents.estimatedETA)
        ));

      for (const incident of enRouteIncidents) {
        if (!incident.dispatchTime || !incident.estimatedETA) continue;
        
        // Calculate when ETA should be reached
        const dispatchTime = new Date(incident.dispatchTime);
        const etaReachedTime = new Date(dispatchTime.getTime() + (incident.estimatedETA * 60 * 1000));
        const completedTime = new Date(etaReachedTime.getTime() + (10 * 60 * 1000)); // 10 minutes after ETA
        
        // Check if we've reached the ETA
        if (now >= etaReachedTime && incident.status === 'en_route') {
          await this.updateIncidentStatus(incident.id, 'arriving_shortly');
          console.log(`Updated incident ${incident.id} to arriving_shortly status`);
        }
      }

      // Find incidents that are arriving_shortly and should be completed
      const arrivingIncidents = await db.select().from(incidents)
        .where(and(
          eq(incidents.status, 'arriving_shortly'),
          isNotNull(incidents.estimatedETA)
        ));

      for (const incident of arrivingIncidents) {
        if (!incident.dispatchTime || !incident.estimatedETA) continue;
        
        // Calculate when incident should be completed (10 minutes after ETA)
        const dispatchTime = new Date(incident.dispatchTime);
        const etaReachedTime = new Date(dispatchTime.getTime() + (incident.estimatedETA * 60 * 1000));
        const completedTime = new Date(etaReachedTime.getTime() + (10 * 60 * 1000));
        
        // Check if we've reached completion time
        if (now >= completedTime) {
          await this.updateIncidentStatus(incident.id, 'completed');
          console.log(`Updated incident ${incident.id} to completed status`);
        }
      }

    } catch (error) {
      console.error('Error checking incident statuses:', error);
    }
  }

  private async updateIncidentStatus(incidentId: number, newStatus: string) {
    try {
      const [updatedIncident] = await db.update(incidents)
        .set({ 
          status: newStatus,
          updatedAt: new Date()
        })
        .where(eq(incidents.id, incidentId))
        .returning();

      // Broadcast the update via WebSocket
      try {
        const websocket = (await import('./websocket')).websocketService;
        if (websocket && websocket.broadcast) {
          websocket.broadcast({
            type: 'incident_updated',
            incident: updatedIncident
          });
        }
      } catch (error) {
        console.log('WebSocket not available for broadcasting');
      }

      return updatedIncident;
    } catch (error) {
      console.error(`Error updating incident ${incidentId} status:`, error);
      throw error;
    }
  }
}

export const incidentStatusMonitor = new IncidentStatusMonitor();