"use client";

import { Activity } from "lucide-react";
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
}

interface DashboardRecentActivityProps {
  activities: ActivityItem[];
  storeTerm: string;
  getActivityColor: (type: string) => string;
}

export function DashboardRecentActivity({
  activities,
  storeTerm,
  getActivityColor
}: DashboardRecentActivityProps) {
  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Recent Activity
        </CardTitle>
        <CardDescription>
          Latest {storeTerm.toLowerCase()} transactions and updates
        </CardDescription>
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
                className="flex items-center gap-3 p-3 bg-muted rounded-lg"
              >
                <div
                  className={`w-2 h-2 ${getActivityColor(activity.type)} rounded-full`}
                ></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{activity.message}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
