import { ReactNode } from "react";
import MobileHeader from "./MobileHeader";
import MobileBottomNav from "./MobileBottomNav";

interface MobileLayoutProps {
  children: ReactNode;
  title?: string;
  onSearchClick?: () => void;
  noPadding?: boolean;
}

export default function MobileLayout({ 
  children, 
  title, 
  onSearchClick,
  noPadding = false 
}: MobileLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 md:hidden">
      {/* Mobile Header */}
      <MobileHeader title={title} onSearchClick={onSearchClick} />
      
      {/* Content Area with padding for fixed header and bottom nav */}
      <div className="pt-14 pb-16 h-screen overflow-hidden">
        <div className={`h-full overflow-y-auto ${noPadding ? '' : 'p-4'}`}>
          {children}
        </div>
      </div>

      {/* Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}