"use client";

import { ChevronRight, Bell, Activity, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/lib/api/hooks";
import { webApiClient } from "@/lib/api/client";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DashboardSkeleton } from "../dashboard-skeleton";

interface NotificationsViewProps {
  onBack: () => void;
}

export function NotificationsView({ onBack }: NotificationsViewProps) {
  const { data: notifications, isLoading, refetch } = useNotifications();

  const markAsRead = async (id: string, category: string) => {
    if (category !== 'system') return;
    try {
      await webApiClient.request(`notifications/${id}/read`, { method: 'POST' });
      refetch();
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  if (isLoading && !notifications) {
    return <DashboardSkeleton />;
  }

  const notifs = notifications || [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Notifications Center</h1>
          <p className="text-muted-foreground font-medium">Stay updated with your pharmacy fleet's activity and administrative messages</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl font-bold" onClick={() => refetch()}>Refresh</Button>
          <Button variant="outline" size="sm" className="rounded-xl font-bold" onClick={onBack}>Back to Overview</Button>
        </div>
      </div>

      {notifs.length === 0 ? (
        <Card className="border-2 border-dashed flex flex-col items-center justify-center py-20 bg-muted/20 rounded-3xl">
          <Bell className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground font-black">No notifications yet</p>
        </Card>
      ) : (
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {notifs.map((notif: any) => (
                <div 
                  key={notif.id} 
                  className={`flex items-start gap-4 p-6 hover:bg-muted/30 transition-colors cursor-pointer group ${!notif.isRead ? 'bg-primary/5' : ''}`}
                  onClick={() => markAsRead(notif.id, notif.category)}
                >
                  <div className={`mt-1 h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                    notif.category === 'system' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {notif.category === 'system' ? <Bell className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`
                          text-[10px] font-black border-none px-2 py-0.5 rounded-full
                          ${notif.type === 'success' ? 'bg-emerald-100 text-emerald-700' : 
                            notif.type === 'warning' ? 'bg-amber-100 text-amber-700' : 
                            notif.type === 'error' ? 'bg-destructive/10 text-destructive' : 
                            'bg-blue-100 text-blue-700'}
                        `}>
                          {notif.type?.toUpperCase() || 'INFO'}
                        </Badge>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{notif.category}</span>
                        {!notif.isRead && (
                          <span className="h-2 w-2 bg-indigo-600 rounded-full" title="New message" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">{notif.time}</span>
                    </div>
                    <h4 className="font-black text-lg group-hover:text-primary transition-colors truncate">{notif.title}</h4>
                    <p className="text-muted-foreground font-medium text-sm leading-relaxed mt-1">{notif.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
