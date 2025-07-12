import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Bell, 
  BellOff, 
  AlertTriangle, 
  X, 
  Check, 
  Volume2, 
  VolumeX,
  Circle,
  AlertCircle
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';

interface Alert {
  id: number;
  type: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  isRead: boolean;
  isAcknowledged: boolean;
  soundEnabled: boolean;
  visualHighlight: boolean;
  relatedCallId?: number;
  createdAt: string;
  expiresAt?: string;
}

interface AlertNotificationCenterProps {
  onCriticalAlert?: (alert: Alert) => void;
}

export function AlertNotificationCenter({ onCriticalAlert }: AlertNotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch medical director insights instead of general alerts
  const { data: medicalDirectorInsights = [], refetch: refetchInsights } = useQuery({
    queryKey: ['/api/analytics/medical-director-insights'],
    refetchInterval: 30000 // Check for new insights every 30 seconds
  });

  // State for cleared notifications
  const [clearedInsights, setClearedInsights] = useState<Set<string>>(new Set());

  // Clear all notifications
  const clearAllNotifications = () => {
    const allIds = medicalDirectorInsights.map((insight: any) => insight.id);
    setClearedInsights(new Set(allIds));
    toast({
      title: 'All notifications cleared',
      description: 'Medical director insights have been cleared',
    });
  };

  // Clear individual notification
  const clearNotification = (id: string) => {
    setClearedInsights(prev => new Set([...prev, id]));
  };

  // Filter out cleared insights and convert to alert format
  const filteredInsights = medicalDirectorInsights.filter((insight: any) => !clearedInsights.has(insight.id));
  const allAlerts = filteredInsights.map((insight: any) => ({
    id: insight.id,
    type: insight.category,
    title: insight.title,
    message: insight.message,
    severity: insight.severity,
    category: insight.category,
    isRead: false,
    isAcknowledged: false,
    soundEnabled: true,
    visualHighlight: true,
    createdAt: insight.timestamp,
    relatedData: insight.data
  }));

  const unreadAlerts = allAlerts; // All insights are considered unread until cleared

  // WebSocket for real-time alerts
  useEffect(() => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'new_alert' || message.type === 'critical_alert') {
        const alert = message.data;
        
        // Show toast notification
        toast({
          title: alert.title,
          description: alert.message,
          variant: alert.severity === 'high' || alert.severity === 'critical' ? 'destructive' : 'default'
        });

        // Play sound if enabled
        if (soundEnabled && alert.soundEnabled) {
          playAlertSound(alert.severity);
        }

        // Handle critical alerts
        if (alert.severity === 'critical' && onCriticalAlert) {
          onCriticalAlert(alert);
        }

        // Refresh insights
        refetchInsights();
      }
    };

    return () => ws.close();
  }, [soundEnabled, onCriticalAlert, isOpen, refetchInsights, queryClient, toast]);

  const playAlertSound = (severity: string) => {
    const audio = new Audio();
    
    // Different sounds for different severity levels
    switch (severity) {
      case 'critical':
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYgBjWK0fPTgjMGJHfH8N2QQAoUXrTp66hVFApGn+DyvmYgBjWK0fPTgjMGJH0=';
        break;
      case 'high':
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYgBjWK0fPTgjMG';
        break;
      default:
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJH0=';
    }
    
    audio.volume = 0.3;
    audio.play().catch(console.error);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-red-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-4 w-4" />;
      case 'high': return <AlertCircle className="h-4 w-4" />;
      default: return <Circle className="h-4 w-4" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const unreadCount = unreadAlerts.length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-6 w-6 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Medical Director Insights</span>
            <div className="flex items-center gap-2">
              {allAlerts.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllNotifications}
                  title="Clear all notifications"
                >
                  <X className="h-4 w-4" />
                  <span className="ml-1">Clear All</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? 'Disable sound alerts' : 'Enable sound alerts'}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          {allAlerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No alerts at this time</p>
              <p className="text-sm">System is monitoring for emergency incidents</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allAlerts.map((alert: Alert) => (
                <Card 
                  key={alert.id} 
                  className={`transition-all duration-200 ${
                    !alert.isRead ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                  } ${
                    alert.visualHighlight ? 'shadow-lg border-l-4 border-l-red-500' : ''
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={getSeverityColor(alert.severity)}>
                          {getSeverityIcon(alert.severity)}
                          <span className="ml-1 capitalize">{alert.severity}</span>
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {alert.category}
                        </Badge>
                        {!alert.isRead && (
                          <Badge variant="secondary" className="text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(alert.createdAt)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteAlertMutation.mutate(alert.id)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="text-sm font-medium">
                      {alert.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground mb-3">
                      {alert.message}
                    </p>
                    
                    <div className="flex items-center gap-2">
                      {!alert.isRead && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => markAsReadMutation.mutate(alert.id)}
                          className="text-xs"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Mark Read
                        </Button>
                      )}
                      
                      {!alert.isAcknowledged && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => acknowledgeMutation.mutate(alert.id)}
                          className="text-xs"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Acknowledge
                        </Button>
                      )}
                      
                      {alert.relatedCallId && (
                        <Badge variant="outline" className="text-xs">
                          Call #{alert.relatedCallId}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}