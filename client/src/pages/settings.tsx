import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit3, Plus, Save, X, Upload, Settings, MapPin, Radio, FileText, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { SystemSetting, CustomHospital, CustomTalkgroup, TranscriptionDictionary, UnitTag } from '@shared/schema';
import { Link } from 'wouter';

interface EditFormData {
  id?: number;
  [key: string]: any;
}

const categoryColors = {
  'branding': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  'location': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  'audio': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  'system': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
  'dispatch': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  'ems': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  'fire': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  'police': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  'medical': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  'hospital': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
  'unit': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  'incident': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [editingItem, setEditingItem] = useState<EditFormData | null>(null);
  const [formData, setFormData] = useState<EditFormData>({});
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [editingInline, setEditingInline] = useState<{ type: string; id: number; field: string } | null>(null);
  const [inlineValue, setInlineValue] = useState('');

  // Fetch system settings
  const { data: settings = [], isLoading: settingsLoading } = useQuery<SystemSetting[]>({
    queryKey: ['/api/settings'],
    enabled: activeTab === 'general'
  });

  // Fetch talkgroups (including hospital talkgroups)
  const { data: talkgroups = [], isLoading: talkgroupsLoading } = useQuery<CustomTalkgroup[]>({
    queryKey: ['/api/talkgroups'],
    enabled: activeTab === 'talkgroups'
  });

  // Fetch hospitals
  const { data: hospitals = [], isLoading: hospitalsLoading } = useQuery<CustomHospital[]>({
    queryKey: ['/api/hospitals'],
    enabled: activeTab === 'talkgroups'
  });

  // Fetch transcription dictionary
  const { data: transcriptionEntries = [], isLoading: transcriptionLoading } = useQuery<TranscriptionDictionary[]>({
    queryKey: ['/api/transcription-dictionary'],
    enabled: activeTab === 'transcription'
  });

  // Fetch unit tags
  const { data: unitTags = [], isLoading: unitTagsLoading } = useQuery<UnitTag[]>({
    queryKey: ['/api/unit-tags'],
    enabled: activeTab === 'unittags'
  });

  // Update setting mutation
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await fetch(`/api/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      toast({ title: 'Setting updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update setting', variant: 'destructive' });
    }
  });

  // Generic create/update/delete mutations
  const createMutation = useMutation({
    mutationFn: async ({ endpoint, data }: { endpoint: string; data: any }) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      const queryKey = variables.endpoint.replace('/', '/api/');
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setEditingItem(null);
      setFormData({});
      toast({ title: 'Item created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create item', variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ endpoint, data }: { endpoint: string; data: any }) => {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      const baseEndpoint = variables.endpoint.split('/').slice(0, -1).join('/');
      queryClient.invalidateQueries({ queryKey: [baseEndpoint] });
      setEditingItem(null);
      setFormData({});
      toast({ title: 'Item updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update item', variant: 'destructive' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (endpoint: string) => {
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      return response.json();
    },
    onSuccess: (_, endpoint) => {
      const baseEndpoint = endpoint.split('/').slice(0, -1).join('/');
      queryClient.invalidateQueries({ queryKey: [baseEndpoint] });
      toast({ title: 'Item deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete item', variant: 'destructive' });
    }
  });

  // Password change mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to change password');
      }
      
      return response.json();
    },
    onSuccess: () => {
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      toast({
        title: "Success",
        description: "Password changed successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive"
      });
    }
  });

  // Download mutations
  const transcriptDownloadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/export/transcripts', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to download transcripts');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ems-transcripts-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Transcripts downloaded successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to download transcripts",
        variant: "destructive"
      });
    }
  });

  const settingsDownloadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/export/settings', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to download settings');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ems-settings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "System settings downloaded successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to download settings",
        variant: "destructive"
      });
    }
  });

  const handleTranscriptDownload = () => {
    transcriptDownloadMutation.mutate();
  };

  const handleSettingsDownload = () => {
    settingsDownloadMutation.mutate();
  };

  const handleSettingUpdate = async (key: string, value: string) => {
    updateSettingMutation.mutate({ key, value });
  };

  const handleEdit = (item: any, type: string) => {
    setEditingItem({ ...item, type });
    setFormData(item);
  };

  const handleSave = async () => {
    if (!editingItem) return;

    const { type, id, ...data } = editingItem;
    
    try {
      // Handle talkgroups (including hospitals)
      if (type === 'talkgroups') {
        // Save talkgroup data
        const talkgroupData = {
          talkgroupId: formData.talkgroupId,
          systemName: formData.systemName,
          displayName: formData.displayName,
          description: formData.description,
          category: formData.category,
          color: formData.color,
          priority: formData.priority,
          isMonitored: formData.isMonitored
        };

        if (id) {
          // Update existing talkgroup
          await updateMutation.mutateAsync({ endpoint: `/api/talkgroups/${id}`, data: talkgroupData });
        } else {
          // Create new talkgroup
          await createMutation.mutateAsync({ endpoint: '/api/talkgroups', data: talkgroupData });
        }

        // If category is hospital, also save hospital data
        if (formData.category === 'hospital') {
          const hospitalData = {
            talkgroupId: formData.talkgroupId,
            hospitalName: formData.hospitalName || formData.displayName,
            displayName: formData.displayName,
            address: formData.address || null,
            city: formData.city || null,
            state: formData.state || null,
            zipCode: formData.zipCode || null,
            phone: formData.phone || null,
            latitude: formData.latitude && !isNaN(parseFloat(formData.latitude)) ? parseFloat(formData.latitude) : null,
            longitude: formData.longitude && !isNaN(parseFloat(formData.longitude)) ? parseFloat(formData.longitude) : null
          };

          // Check if hospital already exists
          const existingHospital = hospitals.find(h => h.talkgroupId === formData.talkgroupId);
          
          if (existingHospital) {
            // Update existing hospital
            await updateMutation.mutateAsync({ endpoint: `/api/hospitals/${existingHospital.id}`, data: hospitalData });
          } else {
            // Create new hospital
            await createMutation.mutateAsync({ endpoint: '/api/hospitals', data: hospitalData });
          }
        } else {
          // If category changed from hospital to something else, delete hospital data
          const existingHospital = hospitals.find(h => h.talkgroupId === formData.talkgroupId);
          if (existingHospital) {
            await deleteMutation.mutateAsync(`/api/hospitals/${existingHospital.id}`);
          }
        }
        
        // Refresh both queries
        queryClient.invalidateQueries({ queryKey: ['/api/talkgroups'] });
        queryClient.invalidateQueries({ queryKey: ['/api/hospitals'] });
        setEditingItem(null);
        setFormData({});
        toast({ title: 'Talkgroup saved successfully' });
        
      } else {
        // Handle other types (unit-tags, transcription-dictionary, etc.)
        if (id) {
          const endpoint = `/api/${type}/${id}`;
          updateMutation.mutate({ endpoint, data: formData });
        } else {
          const endpoint = `/api/${type}`;
          createMutation.mutate({ endpoint, data: formData });
        }
      }
    } catch (error) {
      console.error('Error saving item:', error);
      toast({ title: 'Failed to save item', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: number, type: string) => {
    if (confirm(`Are you sure you want to delete this ${type.slice(0, -1)}?`)) {
      // For talkgroups, also check if we need to delete associated hospital data
      if (type === 'talkgroups') {
        const talkgroup = talkgroups.find(tg => tg.id === id);
        if (talkgroup && talkgroup.category === 'hospital') {
          const hospital = hospitals.find(h => h.talkgroupId === talkgroup.talkgroupId);
          if (hospital) {
            // Delete hospital data first
            await deleteMutation.mutateAsync(`/api/hospitals/${hospital.id}`);
          }
        }
      }
      
      // Delete the main item
      deleteMutation.mutate(`/api/${type}/${id}`);
    }
  };

  const handleCancel = () => {
    setEditingItem(null);
    setFormData({});
  };

  const handlePasswordChange = () => {
    if (!passwordData.currentPassword || !passwordData.newPassword) {
      toast({
        title: "Error",
        description: "Please fill in all password fields",
        variant: "destructive"
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive"
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: "Error",
        description: "New password must be at least 6 characters",
        variant: "destructive"
      });
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword
    });
  };

  const handleInlineEdit = (type: string, id: number, field: string, currentValue: string) => {
    setEditingInline({ type, id, field });
    setInlineValue(currentValue);
  };

  const handleInlineSave = async () => {
    if (!editingInline) return;

    const { type, id, field } = editingInline;
    const updates = { [field]: inlineValue };

    try {
      await updateMutation.mutateAsync({ 
        endpoint: `/api/${type}/${id}`, 
        data: updates 
      });
      
      setEditingInline(null);
      setInlineValue('');
      
      toast({
        title: "Success",
        description: "Updated successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update",
        variant: "destructive"
      });
    }
  };

  const handleInlineCancel = () => {
    setEditingInline(null);
    setInlineValue('');
  };

  const handleInlineKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInlineSave();
    } else if (e.key === 'Escape') {
      handleInlineCancel();
    }
  };

  const renderGeneralSettings = () => (
    <div className="space-y-4 sm:space-y-6">
      {settings.map((setting: SystemSetting) => (
        <Card key={setting.key} className="bg-gray-50 dark:bg-gray-800/50">
          <CardHeader className="pb-3 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
              <div className="flex-1">
                <CardTitle className="text-base sm:text-lg">{setting.key.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</CardTitle>
                <CardDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">{setting.description}</CardDescription>
              </div>
              <Badge variant="secondary" className={`${categoryColors[setting.category] || categoryColors['system']} text-xs`}>
                {setting.category}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
              {setting.dataType === 'boolean' ? (
                <Select 
                  value={setting.value || undefined} 
                  onValueChange={(value) => handleSettingUpdate(setting.key, value)}
                >
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              ) : setting.dataType === 'number' ? (
                <Input
                  type="number"
                  value={setting.value}
                  onChange={(e) => handleSettingUpdate(setting.key, e.target.value)}
                  className="w-full sm:w-32"
                />
              ) : setting.key === 'logo_path' ? (
                <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full">
                  <Input
                    value={setting.value}
                    onChange={(e) => handleSettingUpdate(setting.key, e.target.value)}
                    className="flex-1"
                    placeholder="/path/to/logo.png"
                  />
                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                    <Upload className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Upload</span>
                  </Button>
                </div>
              ) : (
                <Input
                  value={setting.value}
                  onChange={(e) => handleSettingUpdate(setting.key, e.target.value)}
                  className="flex-1"
                />
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );



  const renderTalkgroupsAndHospitals = () => {
    // Create a map of hospital data by talkgroupId for easy lookup
    const hospitalMap = hospitals.reduce((map, hospital) => {
      map[hospital.talkgroupId] = hospital;
      return map;
    }, {} as Record<string, CustomHospital>);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Talkgroup & Hospital Configuration</h3>
          <Button onClick={() => setEditingItem({ type: 'talkgroups' })}>
            <Plus className="h-4 w-4 mr-1" />
            Add Talkgroup
          </Button>
        </div>
        
        <div className="grid gap-4">
          {talkgroups.map((talkgroup: CustomTalkgroup) => {
            const hospitalData = hospitalMap[talkgroup.talkgroupId];
            const isHospital = talkgroup.category === 'hospital';
            
            return (
              <Card key={talkgroup.id} className="bg-gray-50 dark:bg-gray-800/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {editingInline?.type === 'talkgroups' && editingInline?.id === talkgroup.id && editingInline?.field === 'displayName' ? (
                          <div className="flex items-center space-x-2">
                            <Input
                              value={inlineValue}
                              onChange={(e) => setInlineValue(e.target.value)}
                              onKeyDown={handleInlineKeyPress}
                              onBlur={handleInlineSave}
                              className="h-6 text-sm font-semibold"
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" onClick={handleInlineSave} className="h-6 px-2">
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={handleInlineCancel} className="h-6 px-2">
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <h4 
                            className="font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            onClick={() => handleInlineEdit('talkgroups', talkgroup.id, 'displayName', talkgroup.displayName)}
                            title="Click to edit"
                          >
                            {talkgroup.displayName}
                          </h4>
                        )}
                        {editingInline?.type === 'talkgroups' && editingInline?.id === talkgroup.id && editingInline?.field === 'talkgroupId' ? (
                          <div className="flex items-center space-x-1">
                            <Input
                              value={inlineValue}
                              onChange={(e) => setInlineValue(e.target.value)}
                              onKeyDown={handleInlineKeyPress}
                              onBlur={handleInlineSave}
                              className="h-5 text-xs w-16"
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" onClick={handleInlineSave} className="h-5 px-1">
                              <Save className="h-2 w-2" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={handleInlineCancel} className="h-5 px-1">
                              <X className="h-2 w-2" />
                            </Button>
                          </div>
                        ) : (
                          <Badge 
                            variant="outline" 
                            className="text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            onClick={() => handleInlineEdit('talkgroups', talkgroup.id, 'talkgroupId', talkgroup.talkgroupId)}
                            title="Click to edit"
                          >
                            {talkgroup.talkgroupId}
                          </Badge>
                        )}
                        <Badge variant="secondary" className={categoryColors[talkgroup.category] || categoryColors.system}>
                          {talkgroup.category}
                        </Badge>
                        {talkgroup.isMonitored && (
                          <Badge variant="default" className="text-xs">Monitored</Badge>
                        )}
                      </div>
                      {editingInline?.type === 'talkgroups' && editingInline?.id === talkgroup.id && editingInline?.field === 'description' ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            value={inlineValue}
                            onChange={(e) => setInlineValue(e.target.value)}
                            onKeyDown={handleInlineKeyPress}
                            onBlur={handleInlineSave}
                            className="h-6 text-sm"
                            autoFocus
                          />
                          <Button size="sm" variant="ghost" onClick={handleInlineSave} className="h-6 px-2">
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={handleInlineCancel} className="h-6 px-2">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <p 
                          className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          onClick={() => handleInlineEdit('talkgroups', talkgroup.id, 'description', talkgroup.description || '')}
                          title="Click to edit"
                        >
                          {talkgroup.description || 'Click to add description'}
                        </p>
                      )}
                      {isHospital && hospitalData && (
                        <div className="mt-2 space-y-1">
                          {editingInline?.type === 'hospitals' && editingInline?.id === hospitalData.id && editingInline?.field === 'hospitalName' ? (
                            <div className="flex items-center space-x-2">
                              <Input
                                value={inlineValue}
                                onChange={(e) => setInlineValue(e.target.value)}
                                onKeyDown={handleInlineKeyPress}
                                onBlur={handleInlineSave}
                                className="h-6 text-sm font-medium"
                                autoFocus
                              />
                              <Button size="sm" variant="ghost" onClick={handleInlineSave} className="h-6 px-2">
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleInlineCancel} className="h-6 px-2">
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <p 
                              className="text-sm font-medium text-gray-700 dark:text-gray-200 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              onClick={() => handleInlineEdit('hospitals', hospitalData.id, 'hospitalName', hospitalData.hospitalName || '')}
                              title="Click to edit hospital name"
                            >
                              {hospitalData.hospitalName}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {hospitalData.address}, {hospitalData.city}, {hospitalData.state} {hospitalData.zipCode}
                          </p>
                          {hospitalData.phone && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">Phone: {hospitalData.phone}</p>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        System: {talkgroup.systemName} | Priority: {talkgroup.priority}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit({
                        ...talkgroup,
                        ...(isHospital && hospitalData ? hospitalData : {})
                      }, 'talkgroups')}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(talkgroup.id, 'talkgroups')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  const renderUnitTags = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Unit Tag Management</h3>
        <Button onClick={() => setEditingItem({ type: 'unit-tags' })}>
          <Plus className="h-4 w-4 mr-1" />
          Add Unit Tag
        </Button>
      </div>
      
      <div className="grid gap-4">
        {unitTags.map((tag: UnitTag) => (
          <Card key={tag.id} className="bg-gray-50 dark:bg-gray-800/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">{tag.displayName}</h4>
                    <Badge 
                      variant="secondary" 
                      className="text-xs"
                      style={{ backgroundColor: tag.color, color: '#ffffff' }}
                    >
                      {tag.unitType}
                    </Badge>
                  </div>
                  {tag.notes && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{tag.notes}</p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Status: {tag.isActive ? 'Active' : 'Inactive'}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(tag, 'unit-tags')}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(tag.id, 'unit-tags')}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderTranscription = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Transcription Dictionary</h3>
        <Button onClick={() => setEditingItem({ type: 'transcription-dictionary' })}>
          <Plus className="h-4 w-4 mr-1" />
          Add Entry
        </Button>
      </div>
      
      <div className="grid gap-4">
        {transcriptionEntries.map((entry: TranscriptionDictionary) => (
          <Card key={entry.id} className="bg-gray-50 dark:bg-gray-800/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <code className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-2 py-1 rounded text-sm">
                      {entry.wrongWord}
                    </code>
                    <span className="text-gray-500">→</span>
                    <code className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-2 py-1 rounded text-sm">
                      {entry.correctWord}
                    </code>
                    <Badge variant="secondary" className={categoryColors[entry.category] || categoryColors.system}>
                      {entry.category}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{entry.contextHint}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Used {entry.usageCount} times
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(entry, 'transcription-dictionary')}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(entry.id, 'transcription-dictionary')}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderEditModal = () => {
    if (!editingItem) return null;

    const { type } = editingItem;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-gray-100">
              {editingItem.id ? 'Edit' : 'Add'} {type?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {type === 'talkgroups' && (
              <>
                <div>
                  <Label htmlFor="talkgroupId" className="text-gray-900 dark:text-gray-100">Talkgroup ID</Label>
                  <Input
                    id="talkgroupId"
                    value={formData.talkgroupId || ''}
                    onChange={(e) => setFormData({ ...formData, talkgroupId: e.target.value })}
                    placeholder="10202"
                  />
                </div>
                <div>
                  <Label htmlFor="systemName" className="text-gray-900 dark:text-gray-100">System Name</Label>
                  <Input
                    id="systemName"
                    value={formData.systemName || ''}
                    onChange={(e) => setFormData({ ...formData, systemName: e.target.value })}
                    placeholder="MESA"
                  />
                </div>
                <div>
                  <Label htmlFor="displayName" className="text-gray-900 dark:text-gray-100">Display Name</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName || ''}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="Countywide Dispatch Primary"
                  />
                </div>
                <div>
                  <Label htmlFor="description" className="text-gray-900 dark:text-gray-100">Description</Label>
                  <Input
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Primary dispatch channel for Marion County EMS"
                  />
                </div>
                <div>
                  <Label htmlFor="category" className="text-gray-900 dark:text-gray-100">Category</Label>
                  <Select 
                    value={formData.category || ''} 
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dispatch">Dispatch</SelectItem>
                      <SelectItem value="ems">EMS</SelectItem>
                      <SelectItem value="fire">Fire</SelectItem>
                      <SelectItem value="police">Police</SelectItem>
                      <SelectItem value="hospital">Hospital</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="color" className="text-gray-900 dark:text-gray-100">Color</Label>
                  <Input
                    id="color"
                    type="color"
                    value={formData.color || '#3B82F6'}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="priority" className="text-gray-900 dark:text-gray-100">Priority</Label>
                    <Input
                      id="priority"
                      type="number"
                      value={formData.priority || ''}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                      placeholder="1"
                    />
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <input
                      type="checkbox"
                      id="isMonitored"
                      checked={formData.isMonitored || false}
                      onChange={(e) => setFormData({ ...formData, isMonitored: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="isMonitored" className="text-gray-900 dark:text-gray-100">Monitored</Label>
                  </div>
                </div>
                
                {/* Hospital-specific fields */}
                {formData.category === 'hospital' && (
                  <>
                    <div className="border-t pt-4 mt-4">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Hospital Information</h4>
                    </div>
                    <div>
                      <Label htmlFor="hospitalName" className="text-gray-900 dark:text-gray-100">Hospital Name</Label>
                      <Input
                        id="hospitalName"
                        value={formData.hospitalName || ''}
                        onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                        placeholder="Methodist Hospital"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address" className="text-gray-900 dark:text-gray-100">Address</Label>
                      <Input
                        id="address"
                        value={formData.address || ''}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="1701 N Senate Blvd"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label htmlFor="city" className="text-gray-900 dark:text-gray-100">City</Label>
                        <Input
                          id="city"
                          value={formData.city || ''}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          placeholder="Indianapolis"
                        />
                      </div>
                      <div>
                        <Label htmlFor="state" className="text-gray-900 dark:text-gray-100">State</Label>
                        <Input
                          id="state"
                          value={formData.state || ''}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          placeholder="IN"
                        />
                      </div>
                      <div>
                        <Label htmlFor="zipCode" className="text-gray-900 dark:text-gray-100">ZIP</Label>
                        <Input
                          id="zipCode"
                          value={formData.zipCode || ''}
                          onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                          placeholder="46202"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-gray-900 dark:text-gray-100">Phone</Label>
                      <Input
                        id="phone"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(317) 962-2000"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {type === 'unit-tags' && (
              <>
                <div>
                  <Label htmlFor="displayName" className="text-gray-900 dark:text-gray-100">Display Name</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName || ''}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="Ambulance 1"
                  />
                </div>
                <div>
                  <Label htmlFor="unitType" className="text-gray-900 dark:text-gray-100">Unit Type</Label>
                  <Select 
                    value={formData.unitType || ''} 
                    onValueChange={(value) => setFormData({ ...formData, unitType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ambulance">Ambulance</SelectItem>
                      <SelectItem value="ems">EMS</SelectItem>
                      <SelectItem value="squad">Squad</SelectItem>
                      <SelectItem value="engine">Engine</SelectItem>
                      <SelectItem value="medic">Medic</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="unitNumber" className="text-gray-900 dark:text-gray-100">Unit Number</Label>
                  <Input
                    id="unitNumber"
                    type="number"
                    value={formData.unitNumber || ''}
                    onChange={(e) => setFormData({ ...formData, unitNumber: parseInt(e.target.value) || 0 })}
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label htmlFor="notes" className="text-gray-900 dark:text-gray-100">Notes</Label>
                  <Input
                    id="notes"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Primary ambulance unit for downtown area"
                  />
                </div>
                <div>
                  <Label htmlFor="color" className="text-gray-900 dark:text-gray-100">Color</Label>
                  <Input
                    id="color"
                    type="color"
                    value={formData.color || '#3B82F6'}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="isActive" className="text-gray-900 dark:text-gray-100">Status</Label>
                  <Select 
                    value={formData.isActive !== false ? 'true' : 'false'} 
                    onValueChange={(value) => setFormData({ ...formData, isActive: value === 'true' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {type === 'transcription-dictionary' && (
              <>
                <div>
                  <Label htmlFor="wrongWord" className="text-gray-900 dark:text-gray-100">Wrong Word/Phrase</Label>
                  <Input
                    id="wrongWord"
                    value={formData.wrongWord || ''}
                    onChange={(e) => setFormData({ ...formData, wrongWord: e.target.value })}
                    placeholder="Tessane Park"
                  />
                </div>
                <div>
                  <Label htmlFor="correctWord" className="text-gray-900 dark:text-gray-100">Correct Word/Phrase</Label>
                  <Input
                    id="correctWord"
                    value={formData.correctWord || ''}
                    onChange={(e) => setFormData({ ...formData, correctWord: e.target.value })}
                    placeholder="Chest Pain"
                  />
                </div>
                <div>
                  <Label htmlFor="category" className="text-gray-900 dark:text-gray-100">Category</Label>
                  <Select 
                    value={formData.category || ''} 
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medical">Medical</SelectItem>
                      <SelectItem value="unit">Unit</SelectItem>
                      <SelectItem value="incident">Incident</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="contextHint" className="text-gray-900 dark:text-gray-100">Context Hint</Label>
                  <Input
                    id="contextHint"
                    value={formData.contextHint || ''}
                    onChange={(e) => setFormData({ ...formData, contextHint: e.target.value })}
                    placeholder="Medical emergency calls"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">System Settings</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300">Configure your EMS dashboard settings, hospitals, talkgroups, and transcription corrections.</p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="self-start">
              <Radio className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Dashboard</span>
            </Button>
          </Link>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1 h-auto">
          <TabsTrigger value="general" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 p-2 sm:p-3">
            <Settings className="h-4 w-4" />
            <span className="text-xs sm:text-sm">General</span>
          </TabsTrigger>
          <TabsTrigger value="talkgroups" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 p-2 sm:p-3">
            <Radio className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Talkgroups & Hospitals</span>
          </TabsTrigger>
          <TabsTrigger value="exports" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 p-2 sm:p-3">
            <FileText className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Data Export</span>
          </TabsTrigger>
          <TabsTrigger value="transcription" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 p-2 sm:p-3">
            <FileText className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Transcription</span>
          </TabsTrigger>
          <TabsTrigger value="unittags" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 p-2 sm:p-3">
            <Tag className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Unit Tags</span>
          </TabsTrigger>
          <TabsTrigger value="account" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 p-2 sm:p-3">
            <Settings className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Account</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          {settingsLoading ? (
            <div className="text-center py-8">Loading settings...</div>
          ) : (
            renderGeneralSettings()
          )}
        </TabsContent>

        <TabsContent value="talkgroups">
          {talkgroupsLoading || hospitalsLoading ? (
            <div className="text-center py-8">Loading talkgroups and hospitals...</div>
          ) : (
            renderTalkgroupsAndHospitals()
          )}
        </TabsContent>

        <TabsContent value="transcription">
          {transcriptionLoading ? (
            <div className="text-center py-8">Loading transcription dictionary...</div>
          ) : (
            renderTranscription()
          )}
        </TabsContent>

        <TabsContent value="unittags">
          {unitTagsLoading ? (
            <div className="text-center py-8">Loading unit tags...</div>
          ) : (
            renderUnitTags()
          )}
        </TabsContent>

        <TabsContent value="exports">
          <Card className="bg-gray-50 dark:bg-gray-800/50">
            <CardHeader>
              <CardTitle>Data Export</CardTitle>
              <CardDescription>Download emergency call transcripts and system data for backup or analysis</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <FileText className="h-6 w-6 text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Transcript Export</h3>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Export all emergency call transcripts with metadata including timestamps, call types, and coordinates.
                  </p>
                  <Button 
                    onClick={handleTranscriptDownload}
                    disabled={transcriptDownloadMutation.isPending}
                    className="w-full"
                  >
                    {transcriptDownloadMutation.isPending ? 'Generating Export...' : 'Download All Transcripts'}
                  </Button>
                </Card>
                
                <Card className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <Settings className="h-6 w-6 text-green-600" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">System Settings</h3>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Export all system settings, hospitals, talkgroups, and transcription dictionary entries.
                  </p>
                  <Button 
                    onClick={handleSettingsDownload}
                    disabled={settingsDownloadMutation.isPending}
                    className="w-full"
                    variant="outline"
                  >
                    {settingsDownloadMutation.isPending ? 'Generating Export...' : 'Download System Settings'}
                  </Button>
                </Card>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Export Information</h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• Transcripts are exported as CSV format with all metadata</li>
                  <li>• System settings are exported as JSON format for easy backup</li>
                  <li>• All exports include timestamp for tracking data versions</li>
                  <li>• Audio files are not included in exports (only transcript text)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <Card className="bg-gray-50 dark:bg-gray-800/50">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl">Change Password</CardTitle>
              <CardDescription className="text-sm">Update your admin account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div>
                <Label htmlFor="currentPassword" className="text-gray-900 dark:text-gray-100 text-sm">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  placeholder="Enter current password"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="newPassword" className="text-gray-900 dark:text-gray-100 text-sm">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  placeholder="Enter new password (min 6 characters)"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword" className="text-gray-900 dark:text-gray-100 text-sm">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  placeholder="Confirm new password"
                  className="mt-1"
                />
              </div>
              <Button 
                onClick={handlePasswordChange}
                disabled={changePasswordMutation.isPending}
                className="w-full mt-6"
              >
                {changePasswordMutation.isPending ? 'Changing Password...' : 'Change Password'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {renderEditModal()}
    </div>
  );
}