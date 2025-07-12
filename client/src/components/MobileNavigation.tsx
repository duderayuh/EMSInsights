import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Menu, X, Home, Settings, BarChart3, Building2, Bell, Users, Truck, Heart } from "lucide-react";

interface MobileNavigationProps {
  user: any;
  unreadAlertsCount?: number;
}

export function MobileNavigation({ user, unreadAlertsCount = 0 }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  const hasAdminAccess = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'hospital_admin';
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin'; // Support legacy 'admin' role

  const navigationItems = [
    {
      href: "/",
      label: "Dispatch",
      icon: Home,
      show: true
    },
    {
      href: "/incidents",
      label: "Unit Tracking",
      icon: Truck,
      show: true
    },
    {
      href: "/hospital-calls",
      label: "Hospital Calls",
      icon: Building2,
      show: hasAdminAccess
    },
    {
      href: "/analytics",
      label: "Analytics",
      icon: BarChart3,
      show: hasAdminAccess
    },
    {
      href: "/public-health",
      label: "Public Health",
      icon: Heart,
      show: hasAdminAccess
    },
    {
      href: "/alert-management",
      label: "Alerts",
      icon: Bell,
      show: hasAdminAccess,
      badge: unreadAlertsCount > 0 ? unreadAlertsCount : undefined
    },
    {
      href: "/admin",
      label: "Admin Panel",
      icon: Users,
      show: isSuperAdmin
    },
    {
      href: "/settings",
      label: "Settings",
      icon: Settings,
      show: hasAdminAccess
    }
  ];

  const visibleItems = navigationItems.filter(item => item.show);

  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="relative">
            <Menu className="h-5 w-5" />
            {unreadAlertsCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs flex items-center justify-center"
              >
                {unreadAlertsCount > 99 ? '99+' : unreadAlertsCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 p-0">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-lg font-semibold">EMS Insight</h2>
                <p className="text-sm text-muted-foreground">
                  {user?.firstName} {user?.lastName}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Navigation */}
            <div className="flex-1 py-4">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                
                return (
                  <Link key={item.href} href={item.href}>
                    <button
                      onClick={() => setOpen(false)}
                      className={`w-full flex items-center gap-3 px-6 py-3 text-left transition-colors ${
                        isActive 
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-r-2 border-blue-600' 
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="font-medium">{item.label}</span>
                      {item.badge && (
                        <Badge variant="destructive" className="ml-auto">
                          {item.badge > 99 ? '99+' : item.badge}
                        </Badge>
                      )}
                    </button>
                  </Link>
                );
              })}
            </div>

            {/* User Info & Logout */}
            <div className="border-t p-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Role: <span className="font-medium">
                    {user?.role === 'super_admin' || user?.role === 'admin' ? 'Super Admin' : 
                     user?.role === 'hospital_admin' ? 'Hospital Admin' : 'User'}
                  </span>
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    fetch('/api/auth/logout', { method: 'POST' })
                      .then(() => window.location.href = '/login');
                  }}
                >
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}