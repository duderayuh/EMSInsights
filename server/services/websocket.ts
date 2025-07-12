import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { Call, SystemHealth } from '@shared/schema';
import { storage } from '../storage';
import { talkgroupMapper } from './talkgroup-mapper';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private incidentClients: Set<WebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    // Single WebSocket server that handles both regular and incident connections
    this.wss = new WebSocketServer({ 
      server,
      verifyClient: (info) => {
        // Accept connections to both /ws and /ws/incidents
        return info.req.url === '/ws' || info.req.url === '/ws/incidents';
      }
    });
    this.setupWebSocket();
    this.startHeartbeat();
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket, req: any) => {
      const isIncidentConnection = req.url === '/ws/incidents';
      
      if (isIncidentConnection) {
        console.log('New Incident WebSocket connection - total incident clients:', this.incidentClients.size + 1);
        this.incidentClients.add(ws);
        this.setupIncidentHandlers(ws);
      } else {
        console.log('New WebSocket connection');
        this.clients.add(ws);
        this.setupRegularHandlers(ws);
      }
    });
  }

  private setupRegularHandlers(ws: WebSocket) {

    // Send initial data
    this.sendInitialData(ws);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleMessage(ws, data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(ws);
    });
  }

  private async sendInitialData(ws: WebSocket) {
    try {
      // Send recent calls with talkgroup mapping, filtering out non-emergency content
      let recentCalls = await storage.getRecentCalls(20);
      
      // Filter out non-emergency content and low confidence calls
      recentCalls = recentCalls.filter(call => {
        if (call.callType === 'Non-Emergency Content') {
          return false;
        }
        if (call.confidence !== null && call.confidence < 0.3) {
          return false;
        }
        return true;
      });
      
      const enhancedCalls = recentCalls.map(call => this.enhanceCallWithTalkgroup(call));
      this.sendMessage(ws, {
        type: 'initial_calls',
        data: enhancedCalls,
        timestamp: Date.now()
      });

      // Send current stats
      const stats = await storage.getCurrentStats();
      this.sendMessage(ws, {
        type: 'stats_update',
        data: stats,
        timestamp: Date.now()
      });

      // Send system health
      const health = await storage.getSystemHealth();
      this.sendMessage(ws, {
        type: 'system_health',
        data: health,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error sending initial data:', error);
    }
  }

  private handleMessage(ws: WebSocket, message: any) {
    switch (message.type) {
      case 'ping':
        this.sendMessage(ws, {
          type: 'pong',
          data: null,
          timestamp: Date.now()
        });
        break;
      
      case 'subscribe':
        // Handle subscription to specific channels
        break;
      
      case 'search_calls':
        this.handleSearchCalls(ws, message.data);
        break;
      
      case 'pong':
        // Ignore pong messages from clients
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private async handleSearchCalls(ws: WebSocket, searchData: any) {
    try {
      const results = await storage.searchCalls(searchData);
      this.sendMessage(ws, {
        type: 'search_results',
        data: results,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling search:', error);
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Search failed' },
        timestamp: Date.now()
      });
    }
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private setupIncidentHandlers(ws: WebSocket) {
    // Send connection confirmation immediately
    this.sendMessage(ws, {
      type: 'connected',
      data: { message: 'Incident WebSocket connected' },
      timestamp: Date.now()
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          this.sendMessage(ws, {
            type: 'pong',
            data: null,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error('Error parsing Incident WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('Incident WebSocket connection closed - remaining clients:', this.incidentClients.size - 1);
      this.incidentClients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('Incident WebSocket error:', error);
      this.incidentClients.delete(ws);
    });
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          this.sendMessage(ws, {
            type: 'heartbeat',
            data: { timestamp: Date.now() },
            timestamp: Date.now()
          });
        }
      });
      
      this.incidentClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          this.sendMessage(ws, {
            type: 'heartbeat',
            data: { timestamp: Date.now() },
            timestamp: Date.now()
          });
        }
      });
    }, 30000); // 30 seconds
  }

  // Helper method to enhance calls with talkgroup mapping
  private enhanceCallWithTalkgroup(call: Call) {
    return {
      ...call,
      talkgroupDescription: call.talkgroup ? talkgroupMapper.getDescription(call.talkgroup) : null,
      talkgroupDisplayName: call.talkgroup ? talkgroupMapper.getDisplayName(call.talkgroup) : null
    };
  }

  // Public methods for broadcasting updates
  broadcastNewCall(call: Call) {
    // Skip broadcasting non-emergency content
    if (call.callType === 'Non-Emergency Content') {
      return;
    }
    
    // Skip broadcasting low confidence calls
    if (call.confidence !== null && call.confidence < 0.3) {
      return;
    }
    
    this.broadcast({
      type: 'new_call',
      data: this.enhanceCallWithTalkgroup(call),
      timestamp: Date.now()
    });
  }

  broadcastCallUpdate(call: Call) {
    // Skip broadcasting non-emergency content
    if (call.callType === 'Non-Emergency Content') {
      return;
    }
    
    // Skip broadcasting low confidence calls
    if (call.confidence !== null && call.confidence < 0.3) {
      return;
    }
    
    this.broadcast({
      type: 'call_update',
      data: this.enhanceCallWithTalkgroup(call),
      timestamp: Date.now()
    });
  }

  broadcastStatsUpdate(stats: any) {
    this.broadcast({
      type: 'stats_update',
      data: stats,
      timestamp: Date.now()
    });
  }

  broadcastSystemHealth(health: SystemHealth[]) {
    this.broadcast({
      type: 'system_health',
      data: health,
      timestamp: Date.now()
    });
  }

  private broadcast(message: WebSocketMessage) {
    console.log(`Broadcasting ${message.type} to ${this.clients.size} clients`);
    this.clients.forEach(ws => {
      this.sendMessage(ws, message);
    });
  }

  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.close();
  }

  getConnectionCount() {
    return this.clients.size;
  }

  // Alert broadcasting methods
  broadcastAlert(alert: any) {
    const enhancedAlert = {
      ...alert,
      timestamp: Date.now()
    };
    
    this.broadcast({
      type: 'new_alert',
      data: enhancedAlert,
      timestamp: Date.now()
    });
  }

  broadcastAlertUpdate(alert: any) {
    const enhancedAlert = {
      ...alert,
      timestamp: Date.now()
    };
    
    this.broadcast({
      type: 'alert_update',
      data: enhancedAlert,
      timestamp: Date.now()
    });
  }

  broadcastCriticalAlert(alert: any) {
    const enhancedAlert = {
      ...alert,
      timestamp: Date.now()
    };
    
    this.broadcast({
      type: 'critical_alert',
      data: enhancedAlert,
      timestamp: Date.now()
    });
  }

  // Incident broadcasting methods
  broadcastIncidentCreated(incident: any) {
    console.log('Broadcasting incident created:', incident.id, incident.unitId, 'to', this.incidentClients.size, 'incident clients');
    this.broadcastToIncidents({
      type: 'incident_created',
      data: incident,
      timestamp: Date.now()
    });
  }

  broadcastIncidentUpdated(incident: any) {
    console.log('Broadcasting incident updated:', incident.id, incident.unitId, 'to', this.incidentClients.size, 'incident clients');
    this.broadcastToIncidents({
      type: 'incident_updated',
      data: incident,
      timestamp: Date.now()
    });
  }

  private broadcastToIncidents(message: WebSocketMessage) {
    console.log(`Broadcasting ${message.type} to ${this.incidentClients.size} incident clients`);
    this.incidentClients.forEach(ws => {
      this.sendMessage(ws, message);
    });
  }
}
