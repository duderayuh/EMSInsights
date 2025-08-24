import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  Edit3, 
  Trash2, 
  Bell, 
  Volume2, 
  Mail, 
  MessageSquare, 
  AlertTriangle, 
  Info, 
  AlertCircle, 
  Zap,
  Settings,
  Clock,
  Target,
  Filter
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import MobileLayout from "@/components/MobileLayout";

interface AlertRule {
  id: number;
  name: string;
  description: string;
  type: string;
  conditions: any;
  actions: any;
  isActive: boolean;
  triggerCount: number;
  lastTriggered: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserAlertPreferences {
  id: number;
  userId: number;
  alertType: string;
  soundEnabled: boolean;
  visualEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  frequencyLimit: number;
  quietHours: any;
  createdAt: string;
  updatedAt: string;
}

export default function AlertManagementPage() {
  const [selectedTab, setSelectedTab] = useState("rules");
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPreferencesDialog, setShowPreferencesDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [editingPreferences, setEditingPreferences] = useState<UserAlertPreferences | null>(null);
  const [newRule, setNewRule] = useState({
    name: "",
    description: "",
    type: "critical",
    conditions: {
      keywords: "",
      callTypes: [],
      priority: "",
      frequency: 1,
      timeWindow: 60
    },
    actions: {
      createAlert: true,
      soundAlert: true,
      visualHighlight: true,
      autoAcknowledge: false,
      notifyUsers: []
    },
    isActive: true
  });
  const [newPreferences, setNewPreferences] = useState({
    alertType: "critical",
    soundEnabled: true,
    visualEnabled: true,
    emailEnabled: false,
    smsEnabled: false,
    frequencyLimit: 5,
    quietHours: {
      enabled: false,
      startTime: "22:00",
      endTime: "06:00"
    }
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch alert rules
  const { data: alertRules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['/api/alert-rules'],
    refetchInterval: 30000,
  });

  // Fetch user alert preferences
  const { data: userPreferences = [], isLoading: preferencesLoading } = useQuery({
    queryKey: ['/api/user-alert-preferences'],
    refetchInterval: 30000,
  });

  // Fetch recent alerts for testing
  const { data: recentAlerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['/api/alerts', { limit: 50 }],
    refetchInterval: 10000,
  });

  // Create alert rule mutation
  const createRuleMutation = useMutation({
    mutationFn: async (ruleData: any) => {
      return await apiRequest('/api/alert-rules', 'POST', ruleData);
    },
    onSuccess: () => {
      toast({
        title: "Alert Rule Created",
        description: "Your alert rule has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/alert-rules'] });
      setShowCreateDialog(false);
      resetNewRule();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create alert rule",
        variant: "destructive",
      });
    },
  });

  // Update alert rule mutation
  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      return await apiRequest(`/api/alert-rules/${id}`, 'PATCH', updates);
    },
    onSuccess: () => {
      toast({
        title: "Alert Rule Updated",
        description: "Your alert rule has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/alert-rules'] });
      setShowEditDialog(false);
      setEditingRule(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update alert rule",
        variant: "destructive",
      });
    },
  });

  // Delete alert rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/alert-rules/${id}`, 'DELETE');
    },
    onSuccess: () => {
      toast({
        title: "Alert Rule Deleted",
        description: "The alert rule has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/alert-rules'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete alert rule",
        variant: "destructive",
      });
    },
  });

  // Update user preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async ({ alertType, preferences }: { alertType: string; preferences: any }) => {
      return await apiRequest(`/api/user-alert-preferences/${alertType}`, 'PUT', preferences);
    },
    onSuccess: () => {
      toast({
        title: "Preferences Updated",
        description: "Your alert preferences have been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user-alert-preferences'] });
      setShowPreferencesDialog(false);
      setEditingPreferences(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update alert preferences",
        variant: "destructive",
      });
    },
  });

  const resetNewRule = () => {
    setNewRule({
      name: "",
      description: "",
      type: "critical",
      conditions: {
        keywords: "",
        callTypes: [],
        priority: "",
        frequency: 1,
        timeWindow: 60
      },
      actions: {
        createAlert: true,
        soundAlert: true,
        visualHighlight: true,
        autoAcknowledge: false,
        notifyUsers: []
      },
      isActive: true
    });
  };

  const handleCreateRule = () => {
    const ruleData = {
      ...newRule,
      conditions: JSON.stringify(newRule.conditions),
      actions: JSON.stringify(newRule.actions)
    };
    createRuleMutation.mutate(ruleData);
  };

  const handleEditRule = (rule: AlertRule) => {
    setEditingRule(rule);
    setShowEditDialog(true);
  };

  const handleUpdateRule = () => {
    if (!editingRule) return;
    updateRuleMutation.mutate({
      id: editingRule.id,
      updates: editingRule
    });
  };

  const handleDeleteRule = (id: number) => {
    if (confirm("Are you sure you want to delete this alert rule?")) {
      deleteRuleMutation.mutate(id);
    }
  };

  const handleEditPreferences = (alertType: string) => {
    const existing = userPreferences.find((p: any) => p.alertType === alertType);
    if (existing) {
      setEditingPreferences(existing);
      setNewPreferences({
        alertType: existing.alertType,
        soundEnabled: existing.soundEnabled,
        visualEnabled: existing.visualEnabled,
        emailEnabled: existing.emailEnabled,
        smsEnabled: existing.smsEnabled,
        frequencyLimit: existing.frequencyLimit,
        quietHours: existing.quietHours || {
          enabled: false,
          startTime: "22:00",
          endTime: "06:00"
        }
      });
    } else {
      setNewPreferences({
        ...newPreferences,
        alertType
      });
    }
    setShowPreferencesDialog(true);
  };

  const handleUpdatePreferences = () => {
    updatePreferencesMutation.mutate({
      alertType: newPreferences.alertType,
      preferences: newPreferences
    });
  };

  const getAlertTypeIcon = (type: string) => {
    switch (type) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <Info className="h-4 w-4 text-blue-500" />;
      case 'anomaly': return <Zap className="h-4 w-4 text-purple-500" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const getAlertTypeBadge = (type: string) => {
    const variants: any = {
      critical: "destructive",
      warning: "secondary",
      info: "default",
      anomaly: "outline"
    };
    return <Badge variant={variants[type] || "default"}>{type}</Badge>;
  };

  const content = (
    <div className={isMobile ? "px-4 py-4" : "container mx-auto px-4 py-6 max-w-7xl"}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Alert Management</h1>
          <p className="text-muted-foreground">Configure alert rules and notification preferences for emergency dispatch analytics</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create Alert Rule
        </Button>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rules" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Alert Rules
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Alert History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Alert Rules
              </CardTitle>
              <CardDescription>
                Configure automated alert rules that monitor emergency dispatch activity and trigger notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rulesLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading alert rules...</div>
              ) : alertRules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No alert rules configured. Create your first rule to start monitoring emergency activity.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Triggers</TableHead>
                      <TableHead>Last Triggered</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertRules.map((rule: AlertRule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{rule.name}</div>
                            <div className="text-sm text-muted-foreground">{rule.description}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getAlertTypeIcon(rule.type)}
                            {getAlertTypeBadge(rule.type)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={rule.isActive ? "default" : "secondary"}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>{rule.triggerCount}</TableCell>
                        <TableCell>
                          {rule.lastTriggered ? formatDistanceToNow(new Date(rule.lastTriggered), { addSuffix: true }) : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleEditRule(rule)}>
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDeleteRule(rule.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Configure how you want to receive alerts for different types of emergency notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {['critical', 'warning', 'info', 'anomaly', 'system'].map((alertType) => {
                const preference = userPreferences.find((p: any) => p.alertType === alertType);
                return (
                  <Card key={alertType} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getAlertTypeIcon(alertType)}
                        <div>
                          <div className="font-medium capitalize">{alertType} Alerts</div>
                          <div className="text-sm text-muted-foreground">
                            {alertType === 'critical' && "Life-threatening emergencies and system failures"}
                            {alertType === 'warning' && "Important incidents requiring attention"}
                            {alertType === 'info' && "General information and status updates"}
                            {alertType === 'anomaly' && "Unusual patterns or data anomalies"}
                            {alertType === 'system' && "System status and maintenance notifications"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm">
                          {preference?.soundEnabled && <Volume2 className="h-4 w-4 text-green-500" />}
                          {preference?.visualEnabled && <Bell className="h-4 w-4 text-blue-500" />}
                          {preference?.emailEnabled && <Mail className="h-4 w-4 text-purple-500" />}
                          {preference?.smsEnabled && <MessageSquare className="h-4 w-4 text-orange-500" />}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleEditPreferences(alertType)}>
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Alerts
              </CardTitle>
              <CardDescription>
                View recent alerts triggered by your configured rules
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading alert history...</div>
              ) : recentAlerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No recent alerts found. Alerts will appear here when triggered by your rules.
                </div>
              ) : (
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {recentAlerts.map((alert: any) => (
                      <div key={alert.id} className="flex items-start gap-3 p-3 border rounded-lg">
                        {getAlertTypeIcon(alert.type)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{alert.title}</span>
                            {getAlertTypeBadge(alert.type)}
                            <Badge variant={alert.severity === 'high' ? 'destructive' : 'secondary'}>
                              {alert.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                          <div className="text-xs text-muted-foreground mt-2">
                            {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Alert Rule Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Alert Rule</DialogTitle>
            <DialogDescription>
              Configure a new alert rule to monitor emergency dispatch activity
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Rule Name</Label>
                <Input
                  id="name"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder="Emergency Response Alert"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Alert Type</Label>
                <Select value={newRule.type} onValueChange={(value) => setNewRule({ ...newRule, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="info">Information</SelectItem>
                    <SelectItem value="anomaly">Anomaly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newRule.description}
                onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                placeholder="Describe what this alert rule monitors..."
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-medium">Trigger Conditions</h4>
              
              <div className="space-y-2">
                <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                <Input
                  id="keywords"
                  value={newRule.conditions.keywords}
                  onChange={(e) => setNewRule({
                    ...newRule,
                    conditions: { ...newRule.conditions, keywords: e.target.value }
                  })}
                  placeholder="cardiac arrest, structure fire, mva"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="frequency">Frequency Threshold</Label>
                  <Input
                    id="frequency"
                    type="number"
                    value={newRule.conditions.frequency}
                    onChange={(e) => setNewRule({
                      ...newRule,
                      conditions: { ...newRule.conditions, frequency: parseInt(e.target.value) }
                    })}
                    placeholder="1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeWindow">Time Window (minutes)</Label>
                  <Input
                    id="timeWindow"
                    type="number"
                    value={newRule.conditions.timeWindow}
                    onChange={(e) => setNewRule({
                      ...newRule,
                      conditions: { ...newRule.conditions, timeWindow: parseInt(e.target.value) }
                    })}
                    placeholder="60"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-medium">Alert Actions</h4>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="soundAlert">Sound Alert</Label>
                  <Switch
                    id="soundAlert"
                    checked={newRule.actions.soundAlert}
                    onCheckedChange={(checked) => setNewRule({
                      ...newRule,
                      actions: { ...newRule.actions, soundAlert: checked }
                    })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="visualHighlight">Visual Highlight</Label>
                  <Switch
                    id="visualHighlight"
                    checked={newRule.actions.visualHighlight}
                    onCheckedChange={(checked) => setNewRule({
                      ...newRule,
                      actions: { ...newRule.actions, visualHighlight: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="autoAcknowledge">Auto-acknowledge</Label>
                  <Switch
                    id="autoAcknowledge"
                    checked={newRule.actions.autoAcknowledge}
                    onCheckedChange={(checked) => setNewRule({
                      ...newRule,
                      actions: { ...newRule.actions, autoAcknowledge: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="isActive">Rule Active</Label>
                  <Switch
                    id="isActive"
                    checked={newRule.isActive}
                    onCheckedChange={(checked) => setNewRule({ ...newRule, isActive: checked })}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateRule} disabled={createRuleMutation.isPending}>
              {createRuleMutation.isPending ? "Creating..." : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification Preferences Dialog */}
      <Dialog open={showPreferencesDialog} onOpenChange={setShowPreferencesDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getAlertTypeIcon(newPreferences.alertType)}
              {newPreferences.alertType.charAt(0).toUpperCase() + newPreferences.alertType.slice(1)} Alert Preferences
            </DialogTitle>
            <DialogDescription>
              Configure how you want to receive {newPreferences.alertType} alerts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h4 className="font-medium">Notification Methods</h4>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4" />
                    <Label htmlFor="soundEnabled">Sound Alerts</Label>
                  </div>
                  <Switch
                    id="soundEnabled"
                    checked={newPreferences.soundEnabled}
                    onCheckedChange={(checked) => setNewPreferences({ ...newPreferences, soundEnabled: checked })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <Label htmlFor="visualEnabled">Visual Notifications</Label>
                  </div>
                  <Switch
                    id="visualEnabled"
                    checked={newPreferences.visualEnabled}
                    onCheckedChange={(checked) => setNewPreferences({ ...newPreferences, visualEnabled: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <Label htmlFor="emailEnabled">Email Notifications</Label>
                  </div>
                  <Switch
                    id="emailEnabled"
                    checked={newPreferences.emailEnabled}
                    onCheckedChange={(checked) => setNewPreferences({ ...newPreferences, emailEnabled: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    <Label htmlFor="smsEnabled">SMS Alerts</Label>
                  </div>
                  <Switch
                    id="smsEnabled"
                    checked={newPreferences.smsEnabled}
                    onCheckedChange={(checked) => setNewPreferences({ ...newPreferences, smsEnabled: checked })}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-medium">Frequency Control</h4>
              
              <div className="space-y-2">
                <Label htmlFor="frequencyLimit">Maximum alerts per hour</Label>
                <Input
                  id="frequencyLimit"
                  type="number"
                  value={newPreferences.frequencyLimit}
                  onChange={(e) => setNewPreferences({ ...newPreferences, frequencyLimit: parseInt(e.target.value) })}
                  placeholder="5"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Quiet Hours</h4>
                <Switch
                  checked={newPreferences.quietHours.enabled}
                  onCheckedChange={(checked) => setNewPreferences({
                    ...newPreferences,
                    quietHours: { ...newPreferences.quietHours, enabled: checked }
                  })}
                />
              </div>
              
              {newPreferences.quietHours.enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={newPreferences.quietHours.startTime}
                      onChange={(e) => setNewPreferences({
                        ...newPreferences,
                        quietHours: { ...newPreferences.quietHours, startTime: e.target.value }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">End Time</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={newPreferences.quietHours.endTime}
                      onChange={(e) => setNewPreferences({
                        ...newPreferences,
                        quietHours: { ...newPreferences.quietHours, endTime: e.target.value }
                      })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreferencesDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePreferences} disabled={updatePreferencesMutation.isPending}>
              {updatePreferencesMutation.isPending ? "Saving..." : "Save Preferences"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
  
  if (isMobile) {
    return (
      <MobileLayout title="Alerts">
        {content}
      </MobileLayout>
    );
  }
  
  return content;
}