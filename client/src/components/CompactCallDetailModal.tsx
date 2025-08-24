import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Play, MapPin, Pause, Building2, Edit3, Save, Trash2, Clock, Phone, MapPinned, AlertTriangle } from "lucide-react";
import { Call } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { useState, useRef, useEffect } from "react";
import { findClosestHospital, formatDistance } from "@/lib/hospital-proximity";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { AudioWaveform } from "@/components/AudioWaveform";

// Apple MapKit type declarations
declare global {
  interface Window {
    mapkit: any;
  }
}

interface CallDetailModalProps {
  call: Call & { units?: any[] };
  onClose: () => void;
}

// Compact Mini Map Component
function MiniMap({ latitude, longitude, location }: { latitude: number | null, longitude: number | null, location: string | null }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize Apple MapKit
  useEffect(() => {
    if (window.mapkit && window.mapkit.maps) {
      setIsLoaded(true);
      return;
    }

    const loadAppleMaps = async () => {
      try {
        if (!document.querySelector('script[src*="mapkit.js"]')) {
          const script = document.createElement('script');
          script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js';
          script.crossOrigin = 'anonymous';
          script.dataset.libraries = 'map,annotations';
          script.dataset.callback = 'initMapKitMiniCompact';
          
          (window as any).initMapKitMiniCompact = async () => {
            try {
              const authorizationCallback = (done: any) => {
                const jwt = import.meta.env.VITE_APPLE_MAPKIT_JS_KEY || '';
                done(jwt);
              };
              
              window.mapkit.init({
                authorizationCallback,
                language: 'en'
              });
              
              setIsLoaded(true);
            } catch (error) {
              console.error('Error initializing MapKit:', error);
            }
          };
          
          document.head.appendChild(script);
        } else if (window.mapkit) {
          setIsLoaded(true);
        }
      } catch (error) {
        console.error('Error loading Apple Maps:', error);
      }
    };

    loadAppleMaps();
  }, []);

  // Create mini-map instance
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !latitude || !longitude || mapInstanceRef.current) return;

    try {
      const center = new window.mapkit.Coordinate(latitude, longitude);
      
      mapInstanceRef.current = new window.mapkit.Map(mapRef.current, {
        center: center,
        region: new window.mapkit.CoordinateRegion(
          center,
          new window.mapkit.CoordinateSpan(0.005, 0.005)
        ),
        showsCompass: window.mapkit.FeatureVisibility.Hidden,
        showsMapTypeControl: false,
        showsZoomControl: false,
        showsScale: window.mapkit.FeatureVisibility.Hidden,
        isRotationEnabled: false,
        isScrollEnabled: false,
        isZoomEnabled: false,
        colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 
          window.mapkit.Map.ColorSchemes.Dark : 
          window.mapkit.Map.ColorSchemes.Light
      });

      const annotation = new window.mapkit.MarkerAnnotation(center, {
        title: location || 'Emergency Location',
        color: '#ef4444',
        glyphText: '🚨'
      });
      
      mapInstanceRef.current.addAnnotation(annotation);
    } catch (error) {
      console.error('Error creating Apple mini-map:', error);
    }
  }, [isLoaded, latitude, longitude, location]);

  if (!latitude || !longitude) {
    return (
      <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <MapPin className="h-6 w-6 mx-auto mb-1" />
          <p className="text-xs">No location data</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <div ref={mapRef} className="h-24 w-full rounded border border-gray-200 dark:border-gray-700" />;
}

export function CompactCallDetailModal({ call: initialCall, onClose }: CallDetailModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch the full call details including units
  const { data: call = initialCall } = useQuery<Call & { units?: any[] }>({
    queryKey: [`/api/calls/${initialCall.id}`],
    enabled: !!initialCall.id
  });
  
  const [editData, setEditData] = useState({
    transcript: call.transcript || '',
    callType: call.callType || '',
    location: call.location || '',
    status: call.status || 'active'
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

  useEffect(() => {
    if (call) {
      setEditData({
        transcript: call.transcript || '',
        callType: call.callType || '',
        location: call.location || '',
        status: call.status || 'active'
      });
    }
  }, [call]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updateData = {
        transcript: editData.transcript || null,
        callType: editData.callType || null,
        location: editData.location || null,
        status: editData.status || 'active'
      };

      await fetch(`/api/calls/${call.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      toast({
        title: "Call updated",
        description: "Changes saved successfully."
      });

      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating call:', error);
      toast({
        title: "Error",
        description: "Failed to save changes.",
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
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      toast({
        title: "Call deleted",
        description: "The call has been removed."
      });

      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      onClose();
    } catch (error) {
      console.error('Error deleting call:', error);
      toast({
        title: "Error",
        description: "Failed to delete the call.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleFixAddress = async () => {
    if (!call.location) return;
    setIsSaving(true);
    
    try {
      const response = await fetch(`/api/calls/${call.id}/fix-address`, {
        method: 'POST'
      });

      if (response.ok) {
        const updatedCall = await response.json();
        toast({
          title: "✓ Address fixed",
          description: `Coordinates updated`
        });
        queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fix address",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto z-[9999]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-sm">
            <span>Call Details - {call.callType || 'Emergency'}</span>
            <div className="flex items-center gap-1 mr-6">
              {isAdmin && !isEditing && (
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="h-7 px-2">
                  <Edit3 className="h-3 w-3" />
                </Button>
              )}
              {isAdmin && isEditing && (
                <>
                  <Button variant="ghost" size="sm" onClick={handleSave} disabled={isSaving} className="h-7 px-2">
                    <Save className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="h-7 px-2">
                    Cancel
                  </Button>
                </>
              )}
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600 hover:text-red-700">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="z-[10000]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Call</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Emergency call details
          </DialogDescription>
        </DialogHeader>
        
        {/* Compact Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Left Column - Call Info */}
          <div className="space-y-2">
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Time
                </span>
                <span className="font-mono">
                  {call.radioTimestamp ? formatDistanceToNow(new Date(call.radioTimestamp), { addSuffix: true }) : 'Unknown'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Type</span>
                {isEditing ? (
                  <Input
                    value={editData.callType}
                    onChange={(e) => handleFieldChange('callType', e.target.value)}
                    className="h-5 text-xs max-w-24 px-1"
                  />
                ) : (
                  <span className="font-medium">{call.callType || 'Unknown'}</span>
                )}
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  Units
                </span>
                <div className="flex flex-wrap gap-1 justify-end max-w-32">
                  {call.units?.map((unit: any) => (
                    <Badge key={unit.id} className="text-xs px-1 py-0 h-4" style={{ 
                      backgroundColor: unit.color || '#3B82F6', 
                      color: '#ffffff'
                    }}>
                      {unit.displayName}
                    </Badge>
                  )) || <span className="text-gray-500">None</span>}
                </div>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <MapPinned className="h-3 w-3" />
                  Location
                </span>
                {isEditing ? (
                  <Input
                    value={editData.location}
                    onChange={(e) => handleFieldChange('location', e.target.value)}
                    className="h-5 text-xs max-w-32 px-1"
                  />
                ) : (
                  <span className="font-medium truncate max-w-32" title={call.location || 'Unknown'}>
                    {call.location || 'Unknown'}
                  </span>
                )}
              </div>
              
              <div className="flex justify-between">
                <span className={`${(call.confidence || 0) < 0.5 ? 'text-red-600' : 'text-gray-600 dark:text-gray-400'}`}>
                  Confidence
                </span>
                <span className={`font-medium ${(call.confidence || 0) < 0.5 ? 'text-red-600' : ''}`}>
                  {Math.round((call.confidence || 0) * 100)}%
                </span>
              </div>
              
              {closestHospital && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Hospital
                  </span>
                  <span className="font-medium text-right truncate max-w-32" title={closestHospital.hospital.name}>
                    {closestHospital.hospital.name} ({formatDistance(closestHospital.distance)})
                  </span>
                </div>
              )}
            </div>
            
            {isAdmin && call.location && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleFixAddress}
                disabled={isSaving}
                className="w-full h-7 text-xs"
              >
                <MapPin className="h-3 w-3 mr-1" />
                {isSaving ? 'Fixing...' : 'Fix Address'}
              </Button>
            )}
          </div>
          
          {/* Right Column - Map */}
          <div>
            <MiniMap 
              latitude={call.latitude} 
              longitude={call.longitude} 
              location={call.location} 
            />
            {call.latitude && call.longitude && (
              <div className="mt-1 text-center">
                <span className="text-xs font-mono text-gray-500">
                  {call.latitude.toFixed(4)}, {call.longitude.toFixed(4)}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Transcript */}
        <div className="mt-3">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Transcript</label>
          {isEditing ? (
            <Textarea
              value={editData.transcript}
              onChange={(e) => handleFieldChange('transcript', e.target.value)}
              className="mt-1 font-mono text-xs min-h-[50px]"
            />
          ) : (
            <div className="mt-1 bg-gray-50 dark:bg-gray-800 rounded p-2 font-mono text-xs">
              {call.transcript || 'No transcript available'}
            </div>
          )}
        </div>
        
        {/* Audio with Waveform */}
        <div className="mt-3">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Audio Playback</label>
          <div className="mt-1 bg-white dark:bg-gray-800 border rounded-lg p-2">
            {call.audioSegmentId && !audioError ? (
              <AudioWaveform
                audioUrl={`/api/audio/segment/${call.audioSegmentId}`}
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                onTimeUpdate={setCurrentTime}
                onDuration={setDuration}
                onEnded={() => setIsPlaying(false)}
                height={40}
                waveColor="#94a3b8"
                progressColor="#3b82f6"
                disabled={!call.audioSegmentId || audioError}
              />
            ) : (
              <div className="flex items-center justify-center h-12 bg-gray-100 dark:bg-gray-700 rounded">
                <span className="text-xs text-gray-500">
                  {audioError ? 'Audio unavailable - rotated out' : 'No audio available'}
                </span>
              </div>
            )}
            <div className="flex justify-between mt-1 text-xs text-gray-500">
              <span>Duration: {duration > 0 ? Math.round(duration) : '0'}s</span>
              <span>Quality: 48kHz Mono</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}