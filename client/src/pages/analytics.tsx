import { HospitalAnalyticsDashboard } from "@/components/HospitalAnalyticsDashboard";
import MobileLayout from "@/components/MobileLayout";
import { useEffect, useState } from "react";

export default function AnalyticsPage() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  if (isMobile) {
    return (
      <MobileLayout title="Analytics">
        <HospitalAnalyticsDashboard />
      </MobileLayout>
    );
  }
  
  return <HospitalAnalyticsDashboard />;
}