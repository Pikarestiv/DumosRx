"use client";

import { Activity, ArrowRight } from "lucide-react";
import Link from "next/link";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";

interface ActivityItem {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  amount?: string;
  rawSale?: any;
}

interface DashboardRecentActivityProps {
  activities: ActivityItem[];
  storeTerm: string;
  getActivityColor: (type: string) => string;
  onActivityClick?: (activity: ActivityItem) => void;
}

export function DashboardRecentActivity({
  activities,
  storeTerm,
  getActivityColor,
  onActivityClick
}: DashboardRecentActivityProps) {
  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="font-serif font-semibold">
            Recent Activity
          </CardTitle>
          <CardDescription>
            Latest {storeTerm.toLowerCase()} transactions and updates
          </CardDescription>
        </div>
        <Link 
          href="/reports" 
          className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 shrink-0 whitespace-nowrap"
        >
          All <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
            <p className="text-xs">
              Activities will appear here as they happen
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className={`group flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${
                  onActivityClick
                    ? 'cursor-pointer bg-background/40 border-border/30 hover:bg-background hover:shadow-sm hover:border-border/80 hover:scale-[1.01]'
                    : 'bg-background/40 border-border/30'
                }`}
                onClick={() => onActivityClick && onActivityClick(activity)}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div
                    className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-xl ${getActivityColor(activity.type).replace('bg-', 'bg-').replace('-500', '-500/10')} text-${getActivityColor(activity.type).replace('bg-', '')}`}
                  >
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <p className="text-sm font-semibold text-foreground truncate">{activity.message.split(':')[0]}</p>
                    <p className="text-xs text-muted-foreground truncate">{activity.message.split(':')[1]?.trim()}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 pl-3">
                  {activity.amount && (
                    <span className="text-sm font-bold text-foreground">{activity.amount}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
