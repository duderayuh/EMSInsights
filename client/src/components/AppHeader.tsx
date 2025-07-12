import { Clock, Phone, AlertTriangle, Radio, Settings, LogOut, User, Bell } from "lucide-react";
import logoImage from "@assets/Untitled design(3)_1751699444548.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useLogout } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AlertNotificationCenter } from "@/components/alert-notification-center";

interface AppHeaderProps {
  stats: {
    totalCalls: number;
    activeCalls: number;
    todayTotal: number;
    activeEmergency: number;
    activeHigh: number;
    avgResponse: number;
  };
  connectionStatus: string;
  systemHealth: any[];
}

export function AppHeader({ stats, connectionStatus, systemHealth }: AppHeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { user, hasAdminAccess, isSuperAdmin } = useAuth();
  const isAdmin = hasAdminAccess; // Use hasAdminAccess for admin features
  const logout = useLogout();

  // Query Rdio Scanner status
  const { data: rdioStatus } = useQuery({
    queryKey: ['/api/rdio-scanner/status'],
    refetchInterval: 5000, // Check every 5 seconds
  });

  // Query app title and subtitle settings
  const { data: appTitle } = useQuery({
    queryKey: ['/api/settings/app_title'],
  });
  
  const { data: appSubtitle } = useQuery({
    queryKey: ['/api/settings/app_subtitle'],
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const isRdioRunning = (rdioStatus as any)?.running === true;
  const audioStatus = systemHealth.find(h => h.component === 'audio_processor')?.status || 'unknown';

  return (
    <header className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 shadow-sm" style={{height: '100px'}}>
      <div className="flex items-center justify-between h-full">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <img 
              src={logoImage} 
              alt="EMS Dashboard Indianapolis" 
              className="h-16 w-auto"
            />
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {(appTitle as any)?.value || 'EMS-Insight'}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {(appSubtitle as any)?.value || 'Emergency Management System'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${isRdioRunning ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className={`text-sm font-medium ${isRdioRunning ? 'text-green-400' : 'text-red-400'}`}>
                {isRdioRunning ? 'Live' : 'Offline'}
              </span>
            </div>
            <span className="text-gray-400 dark:text-gray-500">|</span>
            <div className="flex items-center space-x-1">
              <Radio className={`h-4 w-4 ${audioStatus === 'healthy' ? 'text-green-400' : 'text-red-400'}`} />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Audio: {audioStatus === 'healthy' ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center space-x-1">
              <Clock className="h-4 w-4" />
              <span className="font-mono">
                {currentTime.toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <Phone className="h-4 w-4" />
              <span>{stats.totalCalls.toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-1">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <Badge variant="outline" className="text-orange-400 border-orange-400">
                {stats.activeCalls}
              </Badge>
            </div>
          </div>
          

        </div>

        <div className="flex items-center space-x-3">
          <AlertNotificationCenter />
          
          {isSuperAdmin && (
            <Link href="/admin">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-1" />
                Admin
              </Button>
            </Link>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span>{user?.username}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300">
                <div className="font-medium">{user?.username}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {user?.role === 'super_admin' || user?.role === 'admin' ? 'Super Admin' : 
                   user?.role === 'hospital_admin' ? 'Hospital Admin' : 'User'}
                </div>
              </div>
              <DropdownMenuSeparator />
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center space-x-2">
                    <Settings className="h-4 w-4" />
                    <span>System Settings</span>
                  </Link>
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link href="/alert-management" className="flex items-center space-x-2">
                    <Bell className="h-4 w-4" />
                    <span>Alert Management</span>
                  </Link>
                </DropdownMenuItem>
              )}
              {isAdmin && <DropdownMenuSeparator />}
              <DropdownMenuItem 
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                className="flex items-center space-x-2 text-red-600 dark:text-red-400"
              >
                <LogOut className="h-4 w-4" />
                <span>{logout.isPending ? 'Signing out...' : 'Sign out'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
