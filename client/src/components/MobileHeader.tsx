import { Bell, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MobileHeaderProps {
  onSearchClick?: () => void;
  title?: string;
}

export default function MobileHeader({ onSearchClick, title }: MobileHeaderProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Get unread alerts count
  const { data: unreadAlerts = [] } = useQuery({
    queryKey: ['/api/alerts/unread'],
    refetchInterval: 30000,
  });
  
  const unreadAlertsCount = unreadAlerts.length;

  // Determine page title
  const getPageTitle = () => {
    if (title) return title;
    
    switch (location) {
      case '/': return 'Dispatch';
      case '/incidents': return 'Unit Tracking';
      case '/hospital-calls': return 'Hospital Calls';
      case '/analytics': return 'Analytics';
      case '/public-health': return 'Public Health';
      case '/alert-management': return 'Alert Management';
      case '/admin': return 'Admin Panel';
      case '/settings': return 'Settings';
      default: return 'EMS Insight';
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 md:hidden bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Title */}
        <div className="flex-1">
          <h1 className="text-lg font-semibold truncate">{getPageTitle()}</h1>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Search Button (if applicable) */}
          {onSearchClick && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={onSearchClick}
            >
              <Search className="h-5 w-5" />
            </Button>
          )}

          {/* Alerts */}
          <Link href="/alert-management">
            <Button variant="ghost" size="icon" className="h-9 w-9 relative">
              <Bell className="h-5 w-5" />
              {unreadAlertsCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center"
                >
                  {unreadAlertsCount > 9 ? '9+' : unreadAlertsCount}
                </Badge>
              )}
            </Button>
          </Link>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div>
                  <p className="text-sm font-medium">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user?.role === 'super_admin' || user?.role === 'admin' ? 'Super Admin' : 
                     user?.role === 'hospital_admin' ? 'Hospital Admin' : 'User'}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}