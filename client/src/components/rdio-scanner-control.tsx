import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Play, Square, Server, AlertCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface RdioScannerStatus {
  running: boolean;
  pid: number | null;
  port: number;
  url: string | null;
  adminUrl: string | null;
}

export function RdioScannerControl() {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['/api/rdio-scanner/status'],
    refetchInterval: 5000, // Check status every 5 seconds
  });

  const startMutation = useMutation({
    mutationFn: () => fetch('/api/rdio-scanner/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).then(res => res.json()),
    onMutate: () => setActionLoading(true),
    onSettled: () => {
      setActionLoading(false);
      queryClient.invalidateQueries({ queryKey: ['/api/rdio-scanner/status'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => fetch('/api/rdio-scanner/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).then(res => res.json()),
    onMutate: () => setActionLoading(true),
    onSettled: () => {
      setActionLoading(false);
      queryClient.invalidateQueries({ queryKey: ['/api/rdio-scanner/status'] });
    },
  });

  const handleStart = () => {
    startMutation.mutate();
  };

  const handleStop = () => {
    stopMutation.mutate();
  };

  const handleOpenWeb = () => {
    const rdioStatus = status as RdioScannerStatus;
    if (rdioStatus?.running) {
      // Use proxy route through main app for external access
      const currentHost = window.location.host;
      const protocol = window.location.protocol;
      const proxyUrl = `${protocol}//${currentHost}/rdio-scanner`;
      window.open(proxyUrl, '_blank');
    }
  };

  const handleOpenAdmin = () => {
    const rdioStatus = status as RdioScannerStatus;
    if (rdioStatus?.running) {
      // Use proxy route through main app for external access
      const currentHost = window.location.host;
      const protocol = window.location.protocol;
      const adminProxyUrl = `${protocol}//${currentHost}/rdio-scanner/admin`;
      window.open(adminProxyUrl, '_blank');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Rdio Scanner Server
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading status...</div>
        </CardContent>
      </Card>
    );
  }

  const rdioStatus = status as RdioScannerStatus;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Rdio Scanner Server
          <Badge variant={rdioStatus?.running ? "default" : "secondary"}>
            {rdioStatus?.running ? "Running" : "Stopped"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>Status:</div>
          <div className={rdioStatus?.running ? "text-green-600" : "text-gray-600"}>
            {rdioStatus?.running ? "Active" : "Inactive"}
          </div>
          
          {rdioStatus?.pid && (
            <>
              <div>Process ID:</div>
              <div className="font-mono">{rdioStatus.pid}</div>
            </>
          )}
          
          <div>Port:</div>
          <div className="font-mono">{rdioStatus?.port || 3001}</div>
        </div>

        <div className="flex gap-2">
          {!rdioStatus?.running ? (
            <Button 
              onClick={handleStart} 
              disabled={actionLoading}
              size="sm"
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              {actionLoading ? "Starting..." : "Start Server"}
            </Button>
          ) : (
            <Button 
              onClick={handleStop} 
              disabled={actionLoading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Square className="h-4 w-4" />
              {actionLoading ? "Stopping..." : "Stop Server"}
            </Button>
          )}
        </div>

        {rdioStatus?.running && (
          <div className="flex gap-2">
            <Button 
              onClick={handleOpenWeb}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Open Web Interface
            </Button>
            <Button 
              onClick={handleOpenAdmin}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Admin Panel
            </Button>
          </div>
        )}

        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <div className="font-medium mb-1">About Rdio Scanner</div>
              <div className="text-xs">
                This server receives audio from SDRTrunk and provides a web interface 
                for listening to emergency calls. External access is provided through 
                the main application proxy for secure connectivity.
              </div>
            </div>
          </div>
        </div>

        {rdioStatus?.running && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <div className="font-medium mb-1">Admin Access</div>
                <div className="text-xs space-y-1">
                  <div>Admin Password: <span className="font-mono font-semibold">rdio-scanner</span></div>
                  <div>If proxy admin access fails, try direct URL:</div>
                  <div className="font-mono text-xs bg-amber-100 dark:bg-amber-900 p-1 rounded">
                    http://localhost:3001/admin
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {(startMutation.error || stopMutation.error) && (
          <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
            <div className="text-sm text-red-800 dark:text-red-200">
              Error: {(startMutation.error as Error)?.message || (stopMutation.error as Error)?.message}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}