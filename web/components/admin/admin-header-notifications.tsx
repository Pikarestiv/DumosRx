"use client";

import { Bell, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/lib/api/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface AppNotification {
  id?: string | number;
  type?: string;
  time?: string;
  title?: string;
  description?: string;
  isRead?: boolean;
  link?: string;
  category?: string;
}

export function AdminHeaderNotifications() {
  const router = useRouter();
  const { data: notifications = [] } = useNotifications({ refetchInterval: 60000 });
  const unreadCount = notifications.filter((n: AppNotification) => !n.isRead).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
        >
          <Bell className="h-5 w-5 text-slate-500" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 p-0 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="p-4 bg-indigo-600">
          <h3 className="text-white font-bold">Platform Notifications</h3>
          <p className="text-indigo-100 text-xs">{unreadCount} unread items</p>
        </div>
        <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.map((n: AppNotification, index: number) => (
            <div
              key={n.id || index}
              onClick={() => {
                if (n.link) {
                  router.push(n.link);
                } else if (n.category === "log") {
                  router.push("/admin/system");
                } else {
                  router.push("/admin/settings");
                }
              }}
              className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors flex flex-col gap-1"
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`
                    text-[10px] font-black border-none px-2 py-0.5 rounded-full
                    ${
                      n.type === "success"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : n.type === "warning"
                          ? "bg-amber-500/10 text-amber-500"
                          : n.type === "error"
                            ? "bg-rose-500/10 text-rose-500"
                            : "bg-indigo-500/10 text-indigo-500"
                    }
                  `}
                >
                  {n.type?.toUpperCase() || "INFO"}
                </Badge>
                <span className="text-[10px] text-slate-400 ml-auto flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {n.time}
                </span>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-1 leading-tight">
                {n.title}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-normal line-clamp-2">
                {n.description}
              </p>
            </div>
          ))}
          {notifications.length === 0 && (
            <div className="p-8 text-center text-slate-500 italic">
              No notifications yet
            </div>
          )}
        </div>
        <DropdownMenuSeparator className="m-0 bg-slate-100 dark:bg-slate-800" />
        <div className="p-2 bg-slate-50 dark:bg-slate-900/50">
          <Button
            variant="ghost"
            className="w-full text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100 dark:hover:bg-slate-800"
            onClick={() => router.push("/admin/system")}
          >
            View System Logs
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
