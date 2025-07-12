import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Play, MapPin, Pause, Building2, Edit3, Save, Trash2, X, AlertTriangle } from "lucide-react";
import { Call } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { useState, useRef, useEffect } from "react";
import { findClosestHospital, formatDistance } from "@/lib/hospital-proximity";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient, useQuery } from "@tanstack/react-query";

// Google Maps type declarations
declare global {
  interface Window {
    google: any;
  }
}

declare namespace google {
  namespace maps {
    class Map {
      constructor(mapDiv: HTMLElement, opts?: any);
    }
    class Marker {
      constructor(opts?: any);
    }
    class Size {
      constructor(width: number, height: number);
    }
    class Point {
      constructor(x: number, y: number);
    }
  }
}

interface CallDetailModalProps {
  call: Call & { units?: any[] };
  onClose: () => void;
}

// Google Maps Mini Map Component
function MiniMap({ latitude, longitude, location }: { latitude: number | null, longitude: number | null, location: string | null }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize Google Maps
  useEffect(() => {
    if (window.google && window.google.maps) {
      setIsLoaded(true);
      return;
    }

    // Fetch API key from backend and load Google Maps
    const loadGoogleMaps = async () => {
      try {
        const response = await fetch('/api/config/google-maps-key');
        const data = await response.json();
        
        if (!response.ok || !data.apiKey) {
          console.error('Failed to fetch Google Maps API key:', data.error);
          return;
        }

        // Set up global callback for this specific mini-map
        const callbackName = `initGoogleMiniMap_${Date.now()}`;
        (window as any)[callbackName] = () => {
          setIsLoaded(true);
        };

        // Load Google Maps script if not already loaded
        if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&callback=${callbackName}`;
          script.async = true;
          script.defer = true;
          script.onerror = () => {
            console.error('Failed to load Google Maps script');
          };
          document.head.appendChild(script);
        } else {
          // Google Maps is already loaded
          setIsLoaded(true);
        }

        return () => {
          if ((window as any)[callbackName]) {
            delete (window as any)[callbackName];
          }
        };
      } catch (error) {
        console.error('Error loading Google Maps:', error);
      }
    };

    loadGoogleMaps();
  }, []);

  // Create mini-map instance
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !latitude || !longitude || mapInstanceRef.current) return;

    try {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: latitude, lng: longitude },
        zoom: 16,
        disableDefaultUI: true, // Disable all UI controls for mini-map
        gestureHandling: 'none', // Disable all user interactions
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
          }
        ]
      });

      // Add marker
      markerRef.current = new window.google.maps.Marker({
        position: { lat: latitude, lng: longitude },
        map: mapInstanceRef.current,
        title: location || 'Emergency Location',
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="12" fill="#ef4444" stroke="#ffffff" stroke-width="3"/>
              <circle cx="16" cy="16" r="4" fill="#ffffff"/>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(32, 32),
          anchor: new window.google.maps.Point(16, 16)
        }
      });

      console.log('Google Mini-Map created successfully');
    } catch (error) {
      console.error('Error creating Google mini-map:', error);
    }
  }, [isLoaded, latitude, longitude, location]);

  if (!latitude || !longitude) {
    return (
      <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <MapPin className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">No location data available</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm">Loading map...</p>
        </div>
      </div>
    );
  }

  return <div ref={mapRef} className="h-48 w-full rounded-lg border border-gray-200 dark:border-gray-700" />;
}

export function CallDetailModal({ call, onClose }: CallDetailModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editData, setEditData] = useState({
    transcript: call.transcript || '',
    callType: call.callType || '',
    location: call.location || '',
    latitude: call.latitude?.toString() || '',
    longitude: call.longitude?.toString() || '',
    urgencyScore: call.urgencyScore?.toString() || '',
    priority: call.priority || '',
    status: call.status || 'active'
  });
  const [selectedUnits, setSelectedUnits] = useState<number[]>(
    call.units?.map((unit: any) => unit.id) || []
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch available unit tags
  const { data: availableUnits = [] } = useQuery({
    queryKey: ['/api/unit-tags'],
    enabled: isEditing
  });



  // Calculate closest hospital
  const [closestHospital, setClosestHospital] = useState<{ hospital: any; distance: number } | null>(null);
  
  useEffect(() => {
    const calculateClosestHospital = async () => {
      if (call.latitude && call.longitude) {
        const result = await findClosestHospital(call.latitude, call.longitude);
        setClosestHospital(result);
      }
    };
    
    calculateClosestHospital();
  }, [call.latitude, call.longitude]);



  const urgencyPercentage = (call.urgencyScore || 0) * 100;

  const handlePlayPause = async () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        try {
          await audioRef.current.play();
        } catch (error) {
          console.error('Failed to play audio:', error);
          // Don't set isPlaying to true if play failed
          return;
        }
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (time: number) => {
    if (!isFinite(time) || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current && duration > 0) {
      const progressBar = event.currentTarget;
      const rect = progressBar.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const newTime = (clickX / rect.width) * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      if (isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    
    const onError = () => {
      console.error('Audio loading failed');
      setIsPlaying(false);
      setCurrentTime(0);
      setAudioError(true);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    // Try to load duration from call data if audio metadata fails
    if (call.endMs && call.startMs && call.endMs > call.startMs) {
      const calculatedDuration = (call.endMs - call.startMs) / 1000;
      if (calculatedDuration > 0) {
        setDuration(calculatedDuration);
      }
    }

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [call.endMs, call.startMs]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Prepare the update data with proper type conversions
      const updateData = {
        transcript: editData.transcript || null,
        callType: editData.callType || null,
        location: editData.location || null,
        latitude: editData.latitude ? parseFloat(editData.latitude) : null,
        longitude: editData.longitude ? parseFloat(editData.longitude) : null,
        urgencyScore: editData.urgencyScore ? parseFloat(editData.urgencyScore) : null,
        priority: editData.priority || null,
        status: editData.status || 'active'
      };

      await fetch(`/api/calls/${call.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      // Update unit tags
      const currentUnitIds = call.units?.map((unit: any) => unit.id) || [];
      const unitsToAdd = selectedUnits.filter(id => !currentUnitIds.includes(id));
      const unitsToRemove = currentUnitIds.filter((id: number) => !selectedUnits.includes(id));
      
      // Remove units
      if (unitsToRemove.length > 0) {
        await apiRequest('DELETE', `/api/calls/${call.id}/units`, { unitIds: unitsToRemove });
      }
      
      // Add units
      if (unitsToAdd.length > 0) {
        await apiRequest('POST', `/api/calls/${call.id}/units`, { unitIds: unitsToAdd });
      }

      // Trigger address fix for location fields if they were changed
      if (editData.location !== call.location && editData.location) {
        await fetch(`/api/calls/${call.id}/fix-address`, {
          method: 'POST'
        });
      }

      toast({
        title: "Call updated successfully",
        description: "Changes have been saved to the database."
      });

      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating call:', error);
      toast({
        title: "Error updating call",
        description: "Failed to save changes. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/calls/${call.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      toast({
        title: "Call deleted successfully",
        description: "The call has been removed from the database."
      });

      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      onClose();
    } catch (error) {
      console.error('Error deleting call:', error);
      toast({
        title: "Error deleting call",
        description: "Failed to delete the call. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditFieldChange = (field: string, value: string) => {
    setEditData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFixAddress = async () => {
    if (!call.location) {
      toast({
        title: "No address to fix",
        description: "This call doesn't have an address to geocode.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    toast({
      title: "Geocoding address...",
      description: "Looking up coordinates for the address"
    });
    
    try {
      const response = await fetch(`/api/calls/${call.id}/fix-address`, {
        method: 'POST'
      });

      if (response.ok) {
        const updatedCall = await response.json();
        
        // Update the call data
        Object.assign(call, updatedCall);
        
        toast({
          title: "✓ Address fixed successfully",
          description: `Coordinates updated: ${updatedCall.latitude?.toFixed(6)}, ${updatedCall.longitude?.toFixed(6)}`
        });

        // Refresh queries
        queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
        queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      } else {
        throw new Error('Failed to fix address');
      }
    } catch (error) {
      console.error('Error fixing address:', error);
      toast({
        title: "Error fixing address",
        description: "Failed to geocode the address. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyzeAddress = async () => {
    setIsAnalyzing(true);
    try {
      const response = await apiRequest('POST', `/api/calls/${call.id}/analyze-address`, {});
      
      if (response.data) {
        const analysis = response.data;
        
        // Create a detailed report for the user
        const reportDetails = [
          `Call ID: ${analysis.callId}`,
          `Current Address: ${analysis.currentAddress || 'None'}`,
          `Transcript: "${analysis.transcript}"`,
          `Extraction Result: ${analysis.extractionResult.address || 'None detected'}`,
          `Confidence: ${Math.round(analysis.extractionResult.confidence * 100)}%`,
          `Method Used: ${analysis.extractionResult.method || 'None'}`,
          `Coordinates: ${analysis.currentCoordinates ? analysis.currentCoordinates.join(', ') : 'None'}`,
          `Recommendations: ${analysis.recommendations.join('; ')}`
        ].join('\n');
        
        toast({
          title: "Address Analysis Complete",
          description: "Analysis details have been logged to console. Check for extraction patterns and recommendations.",
          duration: 5000
        });
        
        // Log detailed analysis to console for debugging
        console.log('Address Extraction Analysis:');
        console.log('============================');
        console.log(reportDetails);
        console.log('Full Analysis Object:', analysis);
        
        // Show a summary in the toast
        const summary = analysis.extractionResult.confidence > 0 
          ? `Found: "${analysis.extractionResult.address}" (${Math.round(analysis.extractionResult.confidence * 100)}% confidence)`
          : 'No address detected in transcript';
          
        toast({
          title: "📊 Address Analysis Results",
          description: summary,
          duration: 8000
        });
      } else {
        throw new Error('Failed to analyze address');
      }
    } catch (error) {
      console.error('Error analyzing address:', error);
      toast({
        title: "Error analyzing address",
        description: "Failed to analyze address extraction. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-[9999] sm:max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Call Details</span>
            <div className="flex items-center gap-2 mr-8">
              {isAdmin && !isEditing && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit3 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              {isAdmin && isEditing && (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </Button>
                </>
              )}
              {isAdmin && !isEditing && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="z-[10000]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Call</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this call? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detailed information about the emergency call including transcript, location, and metadata
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Call Information</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Radio Time:</span>
                  <span className="text-sm font-mono">
                    {call.radioTimestamp ? new Date(call.radioTimestamp).toLocaleString() : 'Unknown'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Radio Time Ago:</span>
                  <span className="text-sm">
                    📻 {call.radioTimestamp ? formatDistanceToNow(new Date(call.radioTimestamp), { addSuffix: true }) : 'Unknown'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Processed:</span>
                  <span className="text-sm">
                    ⚙️ {formatDistanceToNow(new Date(call.timestamp), { addSuffix: true })}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Call Type:</span>
                  {isEditing ? (
                    <Select
                      value={editData.callType || ''}
                      onValueChange={(value) => handleEditFieldChange('callType', value)}
                    >
                      <SelectTrigger className="text-sm max-w-48">
                        <SelectValue placeholder="Select call type" />
                      </SelectTrigger>
                      <SelectContent className="z-[10000]">
                        <SelectItem value="Abdominal Pain">Abdominal Pain</SelectItem>
                        <SelectItem value="Abdominal Pain B">Abdominal Pain B</SelectItem>
                        <SelectItem value="Abdominal/Back Pain">Abdominal/Back Pain</SelectItem>
                        <SelectItem value="Abdominal/Back Pain B">Abdominal/Back Pain B</SelectItem>
                        <SelectItem value="Allergic Reaction">Allergic Reaction</SelectItem>
                        <SelectItem value="Allergic Reaction B">Allergic Reaction B</SelectItem>
                        <SelectItem value="Assault / Sexual Assault / Stun Gun">Assault / Sexual Assault / Stun Gun</SelectItem>
                        <SelectItem value="Assist Person">Assist Person</SelectItem>
                        <SelectItem value="Assist Person B">Assist Person B</SelectItem>
                        <SelectItem value="Assist Person C">Assist Person C</SelectItem>
                        <SelectItem value="Bleeding">Bleeding</SelectItem>
                        <SelectItem value="Bleeding Non-Traumatic">Bleeding Non-Traumatic</SelectItem>
                        <SelectItem value="Bleeding Non-Traumatic B">Bleeding Non-Traumatic B</SelectItem>
                        <SelectItem value="Building Alarm">Building Alarm</SelectItem>
                        <SelectItem value="Cardiac Arrest">Cardiac Arrest</SelectItem>
                        <SelectItem value="Chest Pain">Chest Pain</SelectItem>
                        <SelectItem value="Chest Pain/Heart">Chest Pain/Heart</SelectItem>
                        <SelectItem value="Diabetic">Diabetic</SelectItem>
                        <SelectItem value="Diabetic B">Diabetic B</SelectItem>
                        <SelectItem value="Difficulty Breathing">Difficulty Breathing</SelectItem>
                        <SelectItem value="Emergency Dispatch">Emergency Dispatch</SelectItem>
                        <SelectItem value="EMS-Hospital Communications">EMS-Hospital Communications</SelectItem>
                        <SelectItem value="Environmental">Environmental</SelectItem>
                        <SelectItem value="Fire/Hazmat">Fire/Hazmat</SelectItem>
                        <SelectItem value="Gunshot">Gunshot</SelectItem>
                        <SelectItem value="Gunshot Wound">Gunshot Wound</SelectItem>
                        <SelectItem value="Headache">Headache</SelectItem>
                        <SelectItem value="Injured Person">Injured Person</SelectItem>
                        <SelectItem value="Injured Person B">Injured Person B</SelectItem>
                        <SelectItem value="Injured Person C">Injured Person C</SelectItem>
                        <SelectItem value="Investigation">Investigation</SelectItem>
                        <SelectItem value="Mass Casualty">Mass Casualty</SelectItem>
                        <SelectItem value="Medical Emergency">Medical Emergency</SelectItem>
                        <SelectItem value="Mental/Emotional">Mental/Emotional</SelectItem>
                        <SelectItem value="Mental/Emotional B">Mental/Emotional B</SelectItem>
                        <SelectItem value="Mental-Emotional">Mental-Emotional</SelectItem>
                        <SelectItem value="Mental-Emotional B">Mental-Emotional B</SelectItem>
                        <SelectItem value="OB/Childbirth">OB/Childbirth</SelectItem>
                        <SelectItem value="OB/Childbirth B">OB/Childbirth B</SelectItem>
                        <SelectItem value="Overdose">Overdose</SelectItem>
                        <SelectItem value="Overdose B">Overdose B</SelectItem>
                        <SelectItem value="Overdose C">Overdose C</SelectItem>
                        <SelectItem value="Overdose / Poisoning (Ingestion)">Overdose / Poisoning (Ingestion)</SelectItem>
                        <SelectItem value="Pediatric Cardiac Arrest">Pediatric Cardiac Arrest</SelectItem>
                        <SelectItem value="Residential Fire">Residential Fire</SelectItem>
                        <SelectItem value="Seizure">Seizure</SelectItem>
                        <SelectItem value="Seizure B">Seizure B</SelectItem>
                        <SelectItem value="Sick Person">Sick Person</SelectItem>
                        <SelectItem value="Sick Person A">Sick Person A</SelectItem>
                        <SelectItem value="Sick Person B">Sick Person B</SelectItem>
                        <SelectItem value="Sick Person C">Sick Person C</SelectItem>
                        <SelectItem value="Stab / Gunshot / Penetrating Trauma">Stab / Gunshot / Penetrating Trauma</SelectItem>
                        <SelectItem value="Stroke/CVA">Stroke/CVA</SelectItem>
                        <SelectItem value="Trauma/MVC">Trauma/MVC</SelectItem>
                        <SelectItem value="Unconscious / Fainting (Near)">Unconscious / Fainting (Near)</SelectItem>
                        <SelectItem value="Unconscious Person">Unconscious Person</SelectItem>
                        <SelectItem value="Unconscious Person B">Unconscious Person B</SelectItem>
                        <SelectItem value="Unknown Call Type">Unknown Call Type</SelectItem>
                        <SelectItem value="Vehicle Accident">Vehicle Accident</SelectItem>
                        <SelectItem value="Vehicle Accident B">Vehicle Accident B</SelectItem>
                        <SelectItem value="Vehicle Accident C">Vehicle Accident C</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm font-medium">{call.callType || 'Unknown'}</span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Units:</span>
                  {isEditing ? (
                    <div className="flex flex-col gap-2 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {selectedUnits.map((unitId) => {
                          const unit = availableUnits.find((u: any) => u.id === unitId);
                          if (!unit) return null;
                          return (
                            <Badge 
                              key={unit.id} 
                              variant="secondary"
                              className="text-xs flex items-center gap-1"
                              style={{ 
                                backgroundColor: unit.color || '#3B82F6', 
                                color: '#ffffff',
                                border: 'none'
                              }}
                            >
                              {unit.displayName}
                              <X 
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => setSelectedUnits(prev => prev.filter(id => id !== unitId))}
                              />
                            </Badge>
                          );
                        })}
                      </div>
                      <Select
                        value=""
                        onValueChange={(value) => {
                          const unitId = parseInt(value);
                          if (!selectedUnits.includes(unitId)) {
                            setSelectedUnits(prev => [...prev, unitId]);
                          }
                        }}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Add unit..." />
                        </SelectTrigger>
                        <SelectContent className="z-[10000]">
                          {availableUnits
                            .filter((unit: any) => !selectedUnits.includes(unit.id))
                            .map((unit: any) => (
                              <SelectItem key={unit.id} value={unit.id.toString()}>
                                <span 
                                  className="inline-block w-3 h-3 rounded-full mr-2"
                                  style={{ backgroundColor: unit.color }}
                                />
                                {unit.displayName}
                              </SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {call.units && call.units.length > 0 ? (
                        call.units.map((unit: any) => (
                          <Badge 
                            key={unit.id} 
                            variant="secondary"
                            className="text-xs"
                            style={{ 
                              backgroundColor: unit.color || '#3B82F6', 
                              color: '#ffffff',
                              border: 'none'
                            }}
                          >
                            {unit.displayName}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-gray-500">No units assigned</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Location:</span>
                  {isEditing ? (
                    <Input
                      value={editData.location || ''}
                      onChange={(e) => handleEditFieldChange('location', e.target.value)}
                      className="text-sm max-w-48"
                      placeholder="Enter location"
                    />
                  ) : (
                    <span className="text-sm break-words">{call.location || 'Location unknown'}</span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                  <span className={`text-sm ${(call.confidence || 0) < 0.5 ? 'text-red-600' : 'text-gray-600 dark:text-gray-400'}`}>
                    Transcription Confidence:
                  </span>
                  <span className={`text-sm ${(call.confidence || 0) < 0.5 ? 'text-red-600 font-semibold' : ''}`}>
                    {Math.round((call.confidence || 0) * 100)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <MapPin className="h-4 w-4 mr-2" />
                Location Map
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MiniMap 
                latitude={call.latitude} 
                longitude={call.longitude} 
                location={call.location} 
              />
              <div className="mt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Coordinates:</span>
                  <span className="text-sm font-mono">
                    {call.latitude && call.longitude 
                      ? `${call.latitude.toFixed(6)}, ${call.longitude.toFixed(6)}`
                      : 'Not available'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Address:</span>
                  {call.location ? (
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(call.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      {call.location}
                    </a>
                  ) : (
                    <span className="text-sm">Not specified</span>
                  )}
                </div>
                {!call.location && (
                  <div className="flex justify-end mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAnalyzeAddress}
                      disabled={isAnalyzing}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {isAnalyzing ? 'Analyzing...' : 'Report Missing Address'}
                    </Button>
                  </div>
                )}
                {isAdmin && call.location && (
                  <div className="flex justify-end gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFixAddress}
                      disabled={isSaving}
                    >
                      <MapPin className="h-3 w-3 mr-1" />
                      {isSaving ? 'Fixing...' : 'Fix Address'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAnalyzeAddress}
                      disabled={isAnalyzing}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {isAnalyzing ? 'Analyzing...' : 'Report Address Issue'}
                    </Button>
                  </div>
                )}
                {!isAdmin && call.location && (
                  <div className="flex justify-end mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAnalyzeAddress}
                      disabled={isAnalyzing}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {isAnalyzing ? 'Analyzing...' : 'Report Address Issue'}
                    </Button>
                  </div>
                )}
                {closestHospital && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 flex items-center">
                      <Building2 className="h-3 w-3 mr-1" />
                      Closest Hospital:
                    </span>
                    <span className="text-sm font-medium">
                      {closestHospital.hospital.name} ({formatDistance(closestHospital.distance)})
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Cleaned Up Transcription</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Textarea
                value={editData.transcript || ''}
                onChange={(e) => handleEditFieldChange('transcript', e.target.value)}
                className="font-mono text-sm min-h-[100px]"
                placeholder="Enter transcript"
              />
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm text-black">
                {call.transcript || 'No transcript available'}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Audio Segment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center space-x-4 mb-3">
                <Button 
                  size="sm" 
                  className={`w-10 h-10 rounded-full text-white ${
                    !call.audioSegmentId || audioError 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                  onClick={handlePlayPause}
                  disabled={!call.audioSegmentId || audioError}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-900">Call Audio</div>
                  <div className="text-xs text-gray-700 dark:text-gray-800">
                    {audioError ? (
                      <span className="text-red-600">Audio not available - may have been rotated out</span>
                    ) : (
                      <>Duration: {(() => {
                        if (call.endMs && call.startMs && call.endMs > call.startMs) {
                          return Math.round((call.endMs - call.startMs) / 1000);
                        } else if (duration > 0 && isFinite(duration)) {
                          return Math.round(duration);
                        } else {
                          return "Unknown";
                        }
                      })()} seconds</>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-700 dark:text-gray-800">
                  Quality: 48kHz Mono
                </div>
              </div>
              
              {/* Audio Progress Bar */}
              <div className="space-y-2">
                <div 
                  className="w-full bg-gray-200 rounded-full h-2 cursor-pointer"
                  onClick={handleProgressClick}
                >
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-100"
                    style={{ 
                      width: `${duration > 0 && isFinite(duration) && currentTime >= 0 
                        ? Math.min(100, (currentTime / duration) * 100) 
                        : 0}%` 
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
              
              {/* Hidden Audio Element */}
              <audio 
                ref={audioRef}
                preload="metadata"
                src={call.audioSegmentId ? `/api/audio/segment/${call.audioSegmentId}` : ''}
                onLoadedMetadata={() => {
                  if (audioRef.current && isFinite(audioRef.current.duration)) {
                    setDuration(audioRef.current.duration);
                  }
                }}
                onTimeUpdate={() => {
                  if (audioRef.current) {
                    setCurrentTime(audioRef.current.currentTime);
                  }
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  setCurrentTime(0);
                }}
                onError={(e) => {
                  console.error('Audio loading error:', e);
                  console.error('Audio element error details:', {
                    error: e.currentTarget.error,
                    src: e.currentTarget.src,
                    networkState: e.currentTarget.networkState,
                    readyState: e.currentTarget.readyState
                  });
                  setAudioError(true);
                  setIsPlaying(false);
                }}
                onCanPlay={() => {
                  console.log('Audio can play:', call.audioSegmentId);
                  setAudioError(false);
                }}
                onLoadStart={() => {
                  console.log('Audio load started:', call.audioSegmentId);
                }}
              />
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
