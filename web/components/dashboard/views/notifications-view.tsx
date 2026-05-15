"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

interface NotificationsViewProps {
  onBack: () => void;
}

export function NotificationsView({ onBack }: NotificationsViewProps) {
  const notifications = [
    {
      title: "Low Stock Alert: Lagos Branch",
      desc: "Paracetamol 500mg is below threshold (5 units left).",
      time: "2h ago",
      type: "Inventory",
      badge: "bg-orange-100 text-orange-700",
    },
    {
      title: "New Store Connected",
      desc: "'DumosRx Ikeja' has successfully synced its first batch.",
      time: "5h ago",
      type: "System",
      badge: "bg-blue-100 text-blue-700",
    },
    {
      title: "Failed Login Attempt",
      desc: "Multiple failed attempts detected for user 'admin@dumosrx.com'.",
      time: "1d ago",
      type: "Security",
      badge: "bg-red-100 text-red-700",
    },
    {
      title: "Subscription Renewed",
      desc: "Your 'Enterprise Plan' has been successfully renewed for another month.",
      time: "2d ago",
      type: "Billing",
      badge: "bg-green-100 text-green-700",
    },
    {
      title: "Weekly Fleet Report Ready",
      desc: "Your summary for the period May 1 - May 7 is now available.",
      time: "3d ago",
      type: "Reports",
      badge: "bg-purple-100 text-purple-700",
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Notifications Center</h1>
          <p className="text-muted-foreground">Stay updated with your pharmacy fleet's activity</p>
        </div>
        <Button variant="outline" onClick={onBack}>Back to Overview</Button>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {notifications.map((notif, i) => (
              <div key={i} className="flex items-start gap-4 p-6 hover:bg-muted/30 transition-colors cursor-pointer group">
                <div className={`mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${notif.badge}`}>
                  {notif.type}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-lg group-hover:text-primary transition-colors">{notif.title}</h4>
                    <span className="text-xs text-muted-foreground">{notif.time}</span>
                  </div>
                  <p className="text-muted-foreground mt-1">{notif.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground self-center opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
