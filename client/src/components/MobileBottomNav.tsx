import { Link, useLocation } from "wouter";
import { Home, Truck, Building2, BarChart3, Heart, Bell, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

interface NavItem {
  href: string;
  label: string;
  icon: any;
}

export default function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { user, hasAdminAccess } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  
  // Get unread alerts count
  const { data: unreadAlerts = [] } = useQuery({
    queryKey: ['/api/alerts/unread'],
    refetchInterval: 30000,
  });
  
  const unreadAlertsCount = unreadAlerts.length;

  const navItems: NavItem[] = [
    {
      href: "/",
      label: "Dispatch",
      icon: Home,
    },
    {
      href: "/incidents",
      label: "Units",
      icon: Truck,
    },
    {
      href: "/hospital-calls",
      label: "Hospitals",
      icon: Building2,
    },
    {
      href: "/analytics",
      label: "Analytics",
      icon: BarChart3,
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t">
      <nav className="grid grid-cols-5 h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "flex flex-col items-center justify-center h-full w-full space-y-1 transition-colors",
                  isActive 
                    ? "text-primary bg-primary/10" 
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            </Link>
          );
        })}
        
        {/* More Menu */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center h-full w-full space-y-1 transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Menu className="h-5 w-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[60vh] rounded-t-xl">
            <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
            <div className="grid grid-cols-2 gap-4 p-4">
              {/* Public Health */}
              <Link href="/public-health">
                <button
                  onClick={() => setSheetOpen(false)}
                  className="flex flex-col items-center justify-center p-4 rounded-xl bg-accent hover:bg-accent/80 transition-colors h-24"
                >
                  <Heart className="h-6 w-6 mb-2" />
                  <span className="text-xs font-medium">Public Health</span>
                </button>
              </Link>
              
              {/* Alerts */}
              {hasAdminAccess && (
                <Link href="/alert-management">
                  <button
                    onClick={() => setSheetOpen(false)}
                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-accent hover:bg-accent/80 transition-colors h-24 relative"
                  >
                    <Bell className="h-6 w-6 mb-2" />
                    <span className="text-xs font-medium">Alerts</span>
                    {unreadAlertsCount > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute top-2 right-2 h-5 w-5 p-0 text-[10px]"
                      >
                        {unreadAlertsCount > 9 ? '9+' : unreadAlertsCount}
                      </Badge>
                    )}
                  </button>
                </Link>
              )}
              
              {/* Settings */}
              {hasAdminAccess && (
                <Link href="/settings">
                  <button
                    onClick={() => setSheetOpen(false)}
                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-accent hover:bg-accent/80 transition-colors h-24"
                  >
                    <Settings className="h-6 w-6 mb-2" />
                    <span className="text-xs font-medium">Settings</span>
                  </button>
                </Link>
              )}
              
              {/* Admin */}
              {isSuperAdmin && (
                <Link href="/admin">
                  <button
                    onClick={() => setSheetOpen(false)}
                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-accent hover:bg-accent/80 transition-colors h-24"
                  >
                    <Users className="h-6 w-6 mb-2" />
                    <span className="text-xs font-medium">Admin</span>
                  </button>
                </Link>
              )}
            </div>
            
            {/* Logout Button */}
            <div className="px-4 pb-4">
              <Button 
                variant="outline" 
                className="w-full h-12"
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  window.location.href = '/login';
                }}
              >
                Logout
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}