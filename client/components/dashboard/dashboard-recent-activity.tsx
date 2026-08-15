"use client";

import { Activity } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShoppingCart,
  PackagePlus,
  FileText,
  Banknote,
  Truck,
  Pill,
  RotateCcw,
  Package,
} from "lucide-react";
import type { ActivityFeedItem as ActivityItem } from "@/lib/types/dashboard-activity";

interface DashboardRecentActivityProps {
  activities: ActivityItem[];
  getActivityColor: (type: string) => string;
  onActivityClick?: (activity: ActivityItem) => void;
}

export function DashboardRecentActivity({
  activities,

  getActivityColor,
  onActivityClick,
}: DashboardRecentActivityProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case "sale":
        return ShoppingCart;
      case "prescription_sale":
        return Pill;
      case "stock_movement":
        return PackagePlus;
      case "prescription":
        return FileText;
      case "expense":
        return Banknote;
      case "purchase_order":
        return Truck;
      case "return":
        return RotateCcw;
      case "product":
        return Package;
      default:
        return Activity;
    }
  };

  return (
    <Card className="h-full gap-1 sm:gap-5 p-0 sm:p-5 flex flex-col border-none shadow-none bg-transparent sm:border-solid sm:border-border sm:shadow-sm sm:bg-card">
      <CardHeader className="p-0 flex flex-row items-center justify-between gap-y-0">
        <CardTitle className="font-serif font-semibold">
          Recent Activity
        </CardTitle>
        <Link
          href="/reports"
          className="text-xs font-medium text-primary hover:text-primary/80 flex items-center shrink-0 whitespace-nowrap"
        >
          View All
        </Link>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        {activities.length === 0 && <EmptyActivityState />}
        {activities.length > 0 && (
          <ActivityList
            activities={activities}
            onActivityClick={onActivityClick}
            getActivityIcon={getActivityIcon}
            getActivityColor={getActivityColor}
          />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyActivityState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Activity className="h-8 w-8 mb-2 opacity-50" />
      <p className="text-sm">No recent activity</p>
      <p className="text-xs">Activities will appear here as they happen</p>
    </div>
  );
}

function ActivityList({
  activities,
  onActivityClick,
  getActivityIcon,
  getActivityColor,
}: {
  activities: ActivityItem[];
  onActivityClick?: (activity: ActivityItem) => void;
  getActivityIcon: (type: string) => any;
  getActivityColor: (type: string) => string;
}) {
  return (
    <div className="flex flex-col">
      {activities.map((activity) => {
        const displayType = activity.displayType || activity.type;
        const Icon = getActivityIcon(displayType);
        return (
          <div
            key={activity.id}
            className={`group flex items-center justify-between py-3 border-b border-border/50 last:border-0 transition-all duration-200 ${
              onActivityClick
                ? "cursor-pointer hover:bg-muted/30 sm:px-2 rounded-lg -mx-2 px-2"
                : ""
            }`}
            onClick={() => onActivityClick && onActivityClick(activity)}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div
                className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-xl ${getActivityColor(displayType)}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <p className="text-sm font-medium text-foreground truncate">
                  {activity.message.split(":")[0]}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {activity.message.split(":")[1]?.trim()}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0 pl-3">
              {activity.amount && (
                <span className="text-sm font-semibold text-foreground">
                  {activity.amount}
                </span>
              )}
              <span className="text-[11px] sm:text-xs text-muted-foreground font-medium">
                {new Date(activity.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
