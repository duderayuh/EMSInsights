import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { PlusCircle, Trash2, Send, AlertCircle, CheckCircle, Settings, Key, Bell } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function TelegramAdmin() {
  const { toast } = useToast();
  const [newKeyword, setNewKeyword] = useState({
    keyword: '',
    description: '',
    category: '',
    severity: 'medium',
    matchType: 'contains',
    caseSensitive: false,
    notifyHospitalCalls: true
  });

  const [telegramConfig, setTelegramConfig] = useState({
    botToken: '',
    channelId: '',
    channelName: '',
    testMode: false,
    rateLimitPerMinute: 20
  });

  // Fetch Telegram configuration
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['/api/telegram/config']
  });

  // Fetch keywords
  const { data: keywords = [], isLoading: keywordsLoading } = useQuery({
    queryKey: ['/api/telegram/keywords']
  });

  // Fetch system status
  const { data: status } = useQuery({
    queryKey: ['/api/telegram/status'],
    refetchInterval: 5000
  });

  // Fetch recent notifications
  const { data: notifications = [] } = useQuery({
    queryKey: ['/api/telegram/notifications', { limit: 50 }],
    refetchInterval: 10000
  });

  useEffect(() => {
    if (config) {
      setTelegramConfig({
        botToken: config.hasToken ? '••••••••' : '',
        channelId: config.channelId || '',
        channelName: config.channelName || '',
        testMode: config.testMode || false,
        rateLimitPerMinute: config.rateLimitPerMinute || 20
      });
    }
  }, [config]);

  // Create keyword mutation
  const createKeywordMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/telegram/keywords', data),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Keyword added successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/keywords'] });
      setNewKeyword({
        keyword: '',
        description: '',
        category: '',
        severity: 'medium',
        matchType: 'contains',
        caseSensitive: false,
        notifyHospitalCalls: true
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to add keyword',
        variant: 'destructive' 
      });
    }
  });

  // Update keyword mutation
  const updateKeywordMutation = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest('PUT', `/api/telegram/keywords/${id}`, data),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Keyword updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/keywords'] });
    }
  });

  // Delete keyword mutation
  const deleteKeywordMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/telegram/keywords/${id}`),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Keyword deleted successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/keywords'] });
    }
  });

  // Save Telegram config mutation
  const saveConfigMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/telegram/config', data),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Telegram configuration saved successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/config'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save configuration',
        variant: 'destructive' 
      });
    }
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/telegram/test'),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Test message sent to Telegram channel' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to send test message',
        variant: 'destructive' 
      });
    }
  });

  const handleAddKeyword = () => {
    if (!newKeyword.keyword.trim()) {
      toast({ 
        title: 'Error', 
        description: 'Keyword cannot be empty',
        variant: 'destructive' 
      });
      return;
    }
    createKeywordMutation.mutate(newKeyword);
  };

  const handleSaveConfig = () => {
    if (!telegramConfig.botToken || !telegramConfig.channelId) {
      toast({ 
        title: 'Error', 
        description: 'Bot token and channel ID are required',
        variant: 'destructive' 
      });
      return;
    }
    
    // Only send bot token if it's been changed from placeholder
    const configToSend = {
      ...telegramConfig,
      botToken: telegramConfig.botToken === '••••••••' ? undefined : telegramConfig.botToken
    };
    
    saveConfigMutation.mutate(configToSend);
  };

  const handleToggleKeyword = (id: number, isActive: boolean) => {
    updateKeywordMutation.mutate({ id, data: { isActive: !isActive } });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'sent': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'cancelled': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Telegram Notifications</h1>
        <div className="flex gap-2">
          {status?.telegram?.isRunning && (
            <Badge className="bg-green-500">Bot Running</Badge>
          )}
          {status?.keywords?.isActive && (
            <Badge className="bg-blue-500">Monitoring Active</Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="config" className="w-full">
        <TabsList>
          <TabsTrigger value="config">
            <Settings className="w-4 h-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="keywords">
            <Key className="w-4 h-4 mr-2" />
            Keywords
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="w-4 h-4 mr-2" />
            Recent Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Telegram Bot Configuration</CardTitle>
              <CardDescription>Configure your Telegram bot to send notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="botToken">Bot Token</Label>
                <Input
                  id="botToken"
                  type="password"
                  placeholder="Enter your Telegram bot token"
                  value={telegramConfig.botToken}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">Get this from @BotFather on Telegram</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="channelId">Channel ID</Label>
                <Input
                  id="channelId"
                  placeholder="@channelname or -1001234567890"
                  value={telegramConfig.channelId}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, channelId: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">The channel where notifications will be sent</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="channelName">Channel Name (Optional)</Label>
                <Input
                  id="channelName"
                  placeholder="EMS Dispatch Alerts"
                  value={telegramConfig.channelName}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, channelName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rateLimit">Rate Limit (messages per minute)</Label>
                <Input
                  id="rateLimit"
                  type="number"
                  min={1}
                  max={60}
                  value={telegramConfig.rateLimitPerMinute}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, rateLimitPerMinute: parseInt(e.target.value) })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="testMode"
                  checked={telegramConfig.testMode}
                  onCheckedChange={(checked) => setTelegramConfig({ ...telegramConfig, testMode: checked })}
                />
                <Label htmlFor="testMode">Test Mode (log messages without sending)</Label>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleSaveConfig}
                  disabled={saveConfigMutation.isPending}
                >
                  {saveConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => testConnectionMutation.mutate()}
                  disabled={!config?.configured || testConnectionMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {testConnectionMutation.isPending ? 'Sending...' : 'Send Test Message'}
                </Button>
              </div>

              {config?.configured && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <p className="text-sm text-green-600">Telegram bot is configured</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keywords">
          <Card>
            <CardHeader>
              <CardTitle>Notification Keywords</CardTitle>
              <CardDescription>Keywords that trigger Telegram notifications when found in calls</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Keyword</Label>
                    <Input
                      placeholder="e.g., cardiac arrest, shooting"
                      value={newKeyword.keyword}
                      onChange={(e) => setNewKeyword({ ...newKeyword, keyword: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      placeholder="Optional description"
                      value={newKeyword.description}
                      onChange={(e) => setNewKeyword({ ...newKeyword, description: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input
                      placeholder="e.g., Medical, Trauma"
                      value={newKeyword.category}
                      onChange={(e) => setNewKeyword({ ...newKeyword, category: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Severity</Label>
                    <Select 
                      value={newKeyword.severity}
                      onValueChange={(value) => setNewKeyword({ ...newKeyword, severity: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Match Type</Label>
                    <Select 
                      value={newKeyword.matchType}
                      onValueChange={(value) => setNewKeyword({ ...newKeyword, matchType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exact">Exact</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="regex">Regex</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="caseSensitive"
                      checked={newKeyword.caseSensitive}
                      onCheckedChange={(checked) => setNewKeyword({ ...newKeyword, caseSensitive: checked })}
                    />
                    <Label htmlFor="caseSensitive">Case Sensitive</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="notifyHospital"
                      checked={newKeyword.notifyHospitalCalls}
                      onCheckedChange={(checked) => setNewKeyword({ ...newKeyword, notifyHospitalCalls: checked })}
                    />
                    <Label htmlFor="notifyHospital">Include Hospital Calls</Label>
                  </div>
                </div>

                <Button onClick={handleAddKeyword} disabled={createKeywordMutation.isPending}>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  {createKeywordMutation.isPending ? 'Adding...' : 'Add Keyword'}
                </Button>
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Active</TableHead>
                      <TableHead>Keyword</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Match Type</TableHead>
                      <TableHead>Options</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keywords.map((keyword: any) => (
                      <TableRow key={keyword.id}>
                        <TableCell>
                          <Switch
                            checked={keyword.isActive}
                            onCheckedChange={() => handleToggleKeyword(keyword.id, keyword.isActive)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{keyword.keyword}</TableCell>
                        <TableCell>{keyword.description || '-'}</TableCell>
                        <TableCell>{keyword.category || '-'}</TableCell>
                        <TableCell>
                          <Badge className={getSeverityColor(keyword.severity)}>
                            {keyword.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>{keyword.matchType}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {keyword.caseSensitive && <Badge variant="outline">CS</Badge>}
                            {keyword.notifyHospitalCalls && <Badge variant="outline">Hospital</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Keyword</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the keyword "{keyword.keyword}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteKeywordMutation.mutate(keyword.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {keywords.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                  <p>No keywords configured yet</p>
                  <p className="text-sm">Add keywords above to start monitoring calls</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Recent Notifications</CardTitle>
              <CardDescription>Last 50 notifications sent or pending</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Call ID</TableHead>
                      <TableHead>Keyword</TableHead>
                      <TableHead>Message Preview</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifications.map((notification: any) => (
                      <TableRow key={notification.id}>
                        <TableCell>{new Date(notification.createdAt).toLocaleTimeString()}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(notification.status)}>
                            {notification.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{notification.callId}</TableCell>
                        <TableCell>{notification.matchedKeyword}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {notification.messagePreview || notification.error || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {notifications.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-4" />
                  <p>No notifications yet</p>
                  <p className="text-sm">Notifications will appear here once keywords are matched</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}