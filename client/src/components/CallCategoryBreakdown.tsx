import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Call } from "@shared/schema";

interface CallCategoryBreakdownProps {
  calls: Call[];
  timeRange: string;
}

export function CallCategoryBreakdown({ calls, timeRange }: CallCategoryBreakdownProps) {
  const filteredCalls = useMemo(() => {
    const now = new Date();
    let cutoffTime: Date;
    
    switch (timeRange) {
      case "1h":
        cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case "24h":
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        cutoffTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    return calls.filter(call => new Date(call.timestamp) >= cutoffTime);
  }, [calls, timeRange]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    
    filteredCalls.forEach(call => {
      const category = call.callType || 'Unknown';
      stats[category] = (stats[category] || 0) + 1;
    });
    
    // Sort by count descending
    return Object.entries(stats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15); // Show top 15 categories
  }, [filteredCalls]);

  const getTimeRangeLabel = (range: string) => {
    switch (range) {
      case "1h": return "Last Hour";
      case "24h": return "Last 24 Hours";
      case "7d": return "Last 7 Days";
      case "30d": return "Last 30 Days";
      case "90d": return "Last 90 Days";
      default: return "Last 24 Hours";
    }
  };

  const getCategoryColor = (category: string) => {
    const colors = [
      'bg-blue-100 text-blue-800',
      'bg-green-100 text-green-800',
      'bg-yellow-100 text-yellow-800',
      'bg-purple-100 text-purple-800',
      'bg-pink-100 text-pink-800',
      'bg-indigo-100 text-indigo-800',
      'bg-red-100 text-red-800',
      'bg-orange-100 text-orange-800',
      'bg-teal-100 text-teal-800',
      'bg-cyan-100 text-cyan-800',
      'bg-lime-100 text-lime-800',
      'bg-emerald-100 text-emerald-800',
      'bg-violet-100 text-violet-800',
      'bg-fuchsia-100 text-fuchsia-800',
      'bg-rose-100 text-rose-800'
    ];
    
    // Use category hash to get consistent color
    const hash = category.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <Card className="h-full bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-4">
        <CardTitle className="text-base text-gray-900 dark:text-gray-100">
          Call Categories - {getTimeRangeLabel(timeRange)}
        </CardTitle>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {filteredCalls.length} total calls in this period
        </p>
      </CardHeader>
      <CardContent className="space-y-3 overflow-y-auto max-h-48">
        {categoryStats.length === 0 ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">
            No calls found in the selected time period
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categoryStats.map(([category, count], index) => (
              <div
                key={category}
                className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={category}>
                    {category}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {((count / filteredCalls.length) * 100).toFixed(1)}% of total
                  </div>
                </div>
                <Badge 
                  variant="secondary" 
                  className={`ml-2 ${getCategoryColor(category)}`}
                >
                  {count}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}