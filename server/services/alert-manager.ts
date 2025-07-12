import { storage } from '../storage';
import { 
  Alert, InsertAlert, AlertRule, Call,
  AlertType, AlertSeverity, AlertCategory
} from '@shared/schema';

export interface PatternDetectionResult {
  detected: boolean;
  alertTitle: string;
  alertMessage: string;
  severity: string;
  metadata?: any;
}

export class AlertManager {
  private checkIntervalMs = 30000; // Check every 30 seconds
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    // Only start periodic checks if not in deployment environment
    if (process.env.NODE_ENV !== 'production') {
      this.startPeriodicChecks();
    }
  }

  private startPeriodicChecks() {
    this.intervalId = setInterval(() => {
      this.evaluatePatternRules();
      this.cleanupExpiredAlerts();
    }, this.checkIntervalMs);
  }

  stopPeriodicChecks() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Evaluate a new call against all active alert rules
  async evaluateCallForAlerts(call: Call): Promise<Alert[]> {
    const alertsCreated: Alert[] = [];
    
    try {
      const activeRules = await storage.getActiveAlertRules();
      
      for (const rule of activeRules) {
        const shouldTrigger = await this.evaluateRule(rule, call);
        
        if (shouldTrigger) {
          const alert = await this.createAlertFromRule(rule, call);
          if (alert) {
            alertsCreated.push(alert);
            await storage.incrementRuleTriggerCount(rule.id);
          }
        }
      }
    } catch (error) {
      console.error('Error evaluating call for alerts:', error);
    }

    return alertsCreated;
  }

  // Evaluate individual rule against a call
  private async evaluateRule(rule: AlertRule, call: Call): Promise<boolean> {
    const conditions = rule.conditions as any;
    
    switch (rule.ruleType) {
      case 'keyword':
        return this.evaluateKeywordRule(conditions, call);
      case 'pattern':
        return this.evaluatePatternRule(conditions, call);
      case 'threshold':
        return await this.evaluateThresholdRule(conditions, call);
      case 'anomaly':
        return await this.evaluateAnomalyRule(conditions, call);
      default:
        return false;
    }
  }

  // Evaluate keyword-based rules
  private evaluateKeywordRule(conditions: any, call: Call): boolean {
    const keywords = conditions.keywords || [];
    const transcript = call.transcript?.toLowerCase() || '';
    const callType = call.callType?.toLowerCase() || '';
    
    // Check if any critical keywords are present
    for (const keyword of keywords) {
      if (transcript.includes(keyword.toLowerCase()) || 
          callType.includes(keyword.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  // Evaluate pattern-based rules (multiple calls with similarities)
  private evaluatePatternRule(conditions: any, call: Call): boolean {
    // Pattern rules are evaluated during periodic checks
    return false;
  }

  // Evaluate threshold-based rules
  private async evaluateThresholdRule(conditions: any, call: Call): Promise<boolean> {
    const { timeWindow, threshold, callType } = conditions;
    
    if (!timeWindow || !threshold) return false;
    
    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindow * 60000); // timeWindow in minutes
    
    try {
      const recentCalls = await storage.searchCalls({
        callType: callType || call.callType,
        dateFrom: windowStart,
        dateTo: now,
        limit: 100
      });
      
      return recentCalls.length >= threshold;
    } catch (error) {
      console.error('Error evaluating threshold rule:', error);
      return false;
    }
  }

  // Evaluate anomaly detection rules
  private async evaluateAnomalyRule(conditions: any, call: Call): Promise<boolean> {
    // For now, detect address duplications and unusual patterns
    const { checkDuplicateAddresses, timeWindow } = conditions;
    
    if (checkDuplicateAddresses && call.location) {
      const now = new Date();
      const windowStart = new Date(now.getTime() - (timeWindow || 60) * 60000);
      
      try {
        const recentCalls = await storage.searchCalls({
          dateFrom: windowStart,
          dateTo: now,
          limit: 50
        });
        
        const sameAddressCalls = recentCalls.filter(c => 
          c.location && c.location.toLowerCase() === call.location?.toLowerCase()
        );
        
        return sameAddressCalls.length > 1; // Alert if duplicate address within time window
      } catch (error) {
        console.error('Error evaluating anomaly rule:', error);
        return false;
      }
    }
    
    return false;
  }

  // Create alert from rule and call
  private async createAlertFromRule(rule: AlertRule, call: Call): Promise<Alert | null> {
    try {
      const actions = rule.actions as any;
      
      const insertAlert: InsertAlert = {
        type: actions.alertType || AlertType.WARNING,
        title: actions.title || `Alert: ${rule.name}`,
        message: this.generateAlertMessage(rule, call, actions),
        severity: actions.severity || AlertSeverity.MEDIUM,
        category: actions.category || AlertCategory.INCIDENT,
        relatedCallId: call.id,
        relatedData: {
          ruleId: rule.id,
          ruleName: rule.name,
          callData: {
            id: call.id,
            callType: call.callType,
            location: call.location,
            transcript: call.transcript?.substring(0, 200) // Truncate for storage
          }
        },
        soundEnabled: actions.soundEnabled || false,
        visualHighlight: actions.visualHighlight || false,
        autoAcknowledge: actions.autoAcknowledge || false,
        expiresAt: actions.expiresAfterMinutes ? 
          new Date(Date.now() + actions.expiresAfterMinutes * 60000) : null
      };

      return await storage.createAlert(insertAlert);
    } catch (error) {
      console.error('Error creating alert from rule:', error);
      return null;
    }
  }

  // Generate contextual alert message
  private generateAlertMessage(rule: AlertRule, call: Call, actions: any): string {
    const baseMessage = actions.message || `Rule "${rule.name}" triggered`;
    
    const context = {
      callType: call.callType || 'Unknown',
      location: call.location || 'Unknown location',
      time: call.timestamp?.toLocaleTimeString() || 'Unknown time',
      transcript: call.transcript?.substring(0, 100) || 'No transcript'
    };
    
    // Replace placeholders in message
    let message = baseMessage
      .replace('{callType}', context.callType)
      .replace('{location}', context.location)
      .replace('{time}', context.time)
      .replace('{transcript}', context.transcript);
    
    return message;
  }

  // Periodic pattern evaluation
  private async evaluatePatternRules(): Promise<void> {
    try {
      const activeRules = await storage.getActiveAlertRules();
      const patternRules = activeRules.filter(rule => rule.ruleType === 'pattern');
      
      for (const rule of patternRules) {
        const pattern = await this.detectPatterns(rule);
        
        if (pattern.detected) {
          const insertAlert: InsertAlert = {
            type: AlertType.ANOMALY,
            title: pattern.alertTitle,
            message: pattern.alertMessage,
            severity: pattern.severity as any,
            category: AlertCategory.PATTERN,
            relatedData: {
              ruleId: rule.id,
              ruleName: rule.name,
              patternData: pattern.metadata
            },
            soundEnabled: false,
            visualHighlight: true,
            autoAcknowledge: false
          };

          await storage.createAlert(insertAlert);
          await storage.incrementRuleTriggerCount(rule.id);
        }
      }
    } catch (error) {
      console.error('Error evaluating pattern rules:', error);
    }
  }

  // Detect patterns in recent calls
  private async detectPatterns(rule: AlertRule): Promise<PatternDetectionResult> {
    const conditions = rule.conditions as any;
    const { patternType, timeWindow, threshold } = conditions;
    
    const now = new Date();
    const windowStart = new Date(now.getTime() - (timeWindow || 120) * 60000); // Default 2 hours
    
    try {
      const recentCalls = await storage.searchCalls({
        dateFrom: windowStart,
        dateTo: now,
        limit: 200
      });

      switch (patternType) {
        case 'overdose_spike':
          return this.detectOverdoseSpike(recentCalls, threshold || 3);
        case 'area_concentration':
          return this.detectAreaConcentration(recentCalls, threshold || 5);
        case 'call_type_spike':
          return this.detectCallTypeSpike(recentCalls, conditions);
        default:
          return { detected: false, alertTitle: '', alertMessage: '', severity: 'low' };
      }
    } catch (error) {
      console.error('Error detecting patterns:', error);
      return { detected: false, alertTitle: '', alertMessage: '', severity: 'low' };
    }
  }

  // Detect overdose spike pattern
  private detectOverdoseSpike(calls: Call[], threshold: number): PatternDetectionResult {
    const overdoseCalls = calls.filter(call => 
      call.callType?.toLowerCase().includes('overdose') ||
      call.transcript?.toLowerCase().includes('overdose') ||
      call.transcript?.toLowerCase().includes('narcan') ||
      call.transcript?.toLowerCase().includes('heroin') ||
      call.transcript?.toLowerCase().includes('fentanyl')
    );

    if (overdoseCalls.length >= threshold) {
      return {
        detected: true,
        alertTitle: '🚨 Overdose Spike Detected',
        alertMessage: `${overdoseCalls.length} overdose calls detected in the last 2 hours - possible contaminated supply`,
        severity: 'high',
        metadata: {
          callCount: overdoseCalls.length,
          locations: overdoseCalls.map(c => c.location).filter(Boolean),
          timespan: '2 hours'
        }
      };
    }

    return { detected: false, alertTitle: '', alertMessage: '', severity: 'low' };
  }

  // Detect area concentration pattern
  private detectAreaConcentration(calls: Call[], threshold: number): PatternDetectionResult {
    const locationMap = new Map<string, Call[]>();
    
    calls.forEach(call => {
      if (call.location) {
        // Group by general area (first 3 words of address)
        const area = call.location.split(' ').slice(0, 3).join(' ');
        if (!locationMap.has(area)) {
          locationMap.set(area, []);
        }
        locationMap.get(area)!.push(call);
      }
    });

    for (const [area, areaCalls] of locationMap.entries()) {
      if (areaCalls.length >= threshold) {
        return {
          detected: true,
          alertTitle: '📍 High Call Volume Area',
          alertMessage: `${areaCalls.length} calls concentrated in ${area} area - possible incident`,
          severity: 'medium',
          metadata: {
            area,
            callCount: areaCalls.length,
            callTypes: areaCalls.map(c => c.callType).filter(Boolean)
          }
        };
      }
    }

    return { detected: false, alertTitle: '', alertMessage: '', severity: 'low' };
  }

  // Detect call type spike pattern
  private detectCallTypeSpike(calls: Call[], conditions: any): PatternDetectionResult {
    const { callType, threshold } = conditions;
    
    const typeCalls = calls.filter(call => 
      call.callType?.toLowerCase().includes(callType?.toLowerCase() || '')
    );

    if (typeCalls.length >= (threshold || 4)) {
      return {
        detected: true,
        alertTitle: `📈 ${callType} Call Spike`,
        alertMessage: `${typeCalls.length} ${callType} calls in recent period - monitor for trends`,
        severity: 'medium',
        metadata: {
          callType,
          callCount: typeCalls.length,
          locations: typeCalls.map(c => c.location).filter(Boolean)
        }
      };
    }

    return { detected: false, alertTitle: '', alertMessage: '', severity: 'low' };
  }

  // Create critical incident alert
  async createCriticalIncidentAlert(call: Call): Promise<Alert | null> {
    const criticalKeywords = [
      'cardiac arrest', 'mass casualty', 'shooting', 'explosion',
      'building collapse', 'hazmat', 'active shooter', 'multi-vehicle',
      'fatality', 'entrapment', 'critical', 'code blue'
    ];

    const transcript = call.transcript?.toLowerCase() || '';
    const callType = call.callType?.toLowerCase() || '';
    
    const isCritical = criticalKeywords.some(keyword => 
      transcript.includes(keyword) || callType.includes(keyword)
    );

    if (isCritical) {
      const insertAlert: InsertAlert = {
        type: AlertType.CRITICAL,
        title: '🚨 CRITICAL INCIDENT',
        message: `Critical emergency: ${call.callType || 'Unknown type'} at ${call.location || 'Unknown location'}`,
        severity: AlertSeverity.HIGH,
        category: AlertCategory.INCIDENT,
        relatedCallId: call.id,
        relatedData: {
          callData: {
            id: call.id,
            callType: call.callType,
            location: call.location,
            transcript: call.transcript?.substring(0, 200)
          }
        },
        soundEnabled: true,
        visualHighlight: true,
        autoAcknowledge: false
      };

      return await storage.createAlert(insertAlert);
    }

    return null;
  }

  // Address validation alert
  async createAddressValidationAlert(call: Call, issue: string): Promise<Alert | null> {
    const insertAlert: InsertAlert = {
      type: AlertType.WARNING,
      title: '📍 Address Validation Issue',
      message: `Potential address issue for call ${call.id}: ${issue}`,
      severity: AlertSeverity.MEDIUM,
      category: AlertCategory.VALIDATION,
      relatedCallId: call.id,
      relatedData: {
        validationIssue: issue,
        callData: {
          id: call.id,
          location: call.location,
          transcript: call.transcript?.substring(0, 100)
        }
      },
      soundEnabled: false,
      visualHighlight: false,
      autoAcknowledge: true,
      expiresAt: new Date(Date.now() + 30 * 60000) // Expire after 30 minutes
    };

    return await storage.createAlert(insertAlert);
  }

  // System health alert
  async createSystemAlert(component: string, status: string, message: string): Promise<Alert | null> {
    const severity = status === 'error' ? AlertSeverity.HIGH : 
                    status === 'warning' ? AlertSeverity.MEDIUM : AlertSeverity.LOW;

    const insertAlert: InsertAlert = {
      type: AlertType.SYSTEM,
      title: `System Alert: ${component}`,
      message: `${component} status: ${message}`,
      severity,
      category: AlertCategory.SYSTEM,
      relatedData: {
        component,
        status,
        systemData: { timestamp: new Date().toISOString() }
      },
      soundEnabled: severity === AlertSeverity.HIGH,
      visualHighlight: severity !== AlertSeverity.LOW,
      autoAcknowledge: severity === AlertSeverity.LOW
    };

    return await storage.createAlert(insertAlert);
  }

  // Cleanup expired alerts
  private async cleanupExpiredAlerts(): Promise<void> {
    try {
      const deletedCount = await storage.deleteExpiredAlerts();
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} expired alerts`);
      }
    } catch (error) {
      console.error('Error cleaning up expired alerts:', error);
    }
  }

  // Initialize default alert rules
  async initializeDefaultRules(): Promise<void> {
    try {
      const existingRules = await storage.getAllAlertRules();
      
      if (existingRules.length === 0) {
        // Create default critical incident rule
        await storage.createAlertRule({
          name: 'Critical Incidents',
          description: 'Alerts for critical emergency incidents',
          ruleType: 'keyword',
          conditions: {
            keywords: ['cardiac arrest', 'mass casualty', 'shooting', 'explosion', 'hazmat']
          },
          actions: {
            alertType: AlertType.CRITICAL,
            title: '🚨 CRITICAL INCIDENT',
            message: 'Critical emergency: {callType} at {location}',
            severity: AlertSeverity.HIGH,
            category: AlertCategory.INCIDENT,
            soundEnabled: true,
            visualHighlight: true
          },
          priority: 1,
          isActive: true,
          createdBy: 1 // Admin user
        });

        // Create default overdose spike detection
        await storage.createAlertRule({
          name: 'Overdose Spike Detection',
          description: 'Detect multiple overdose calls indicating possible contaminated supply',
          ruleType: 'pattern',
          conditions: {
            patternType: 'overdose_spike',
            timeWindow: 120, // 2 hours
            threshold: 3
          },
          actions: {
            alertType: AlertType.ANOMALY,
            title: '🚨 Overdose Spike Detected',
            message: 'Multiple overdose calls detected - possible contaminated supply',
            severity: AlertSeverity.HIGH,
            category: AlertCategory.PATTERN,
            soundEnabled: true,
            visualHighlight: true
          },
          priority: 2,
          isActive: true,
          createdBy: 1
        });

        console.log('Default alert rules initialized');
      }
    } catch (error) {
      console.error('Error initializing default alert rules:', error);
    }
  }
}

// Create a deployment-safe instance
let alertManagerInstance: AlertManager;

try {
  alertManagerInstance = new AlertManager();
} catch (error) {
  console.error('Error initializing AlertManager:', error);
  // Create a stub instance that does nothing in deployment
  alertManagerInstance = {
    evaluateCallForAlerts: async () => [],
    initializeDefaultRules: async () => {},
    stopPeriodicChecks: () => {},
    createCriticalIncidentAlert: async () => null,
    createAddressValidationAlert: async () => null,
    createSystemAlert: async () => null
  } as any;
}

// Export singleton instance
export const alertManager = alertManagerInstance;