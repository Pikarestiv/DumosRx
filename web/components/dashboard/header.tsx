"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  Search,
  Menu,
  Clock,
  ShieldAlert,
  LogOut,
} from "lucide-react";
import { webApiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/mode-toggle";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  onSetActiveTab: (tab: string) => void;
}

export function Header({ onSetActiveTab }: HeaderProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
       
      setIsImpersonating(!!localStorage.getItem("drx_impersonator_token"));
    }
  }, []);

  const handleEndImpersonation = async () => {
    const adminToken = localStorage.getItem("drx_impersonator_token");
    if (!adminToken) return;

    try {
      await webApiClient.restoreSession(adminToken);

      // Clean up
      localStorage.removeItem("drx_impersonator_token");
      localStorage.removeItem("drx_token");
      localStorage.removeItem("drx_user");

      toast.success("Session Restored", {
        description: "Back to Admin Dashboard",
      });

      window.location.href = "/admin/pharmacies";
    } catch (_error) {
      toast.error("Failed to restore admin session");
    }
  };

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const data = await webApiClient.getNotifications();
        setNotifications(data);
        setUnreadCount(data.filter((n: any) => !n.isRead).length);
      } catch (_error) {
        console.error("Failed to fetch notifications:", error);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-20 bg-background border-b flex items-center justify-between px-8">
      {isImpersonating && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-primary z-60" />
      )}
      <div className="flex items-center gap-4 flex-1">
        {isImpersonating ? (
          <div className="flex items-center gap-3 bg-primary/10 px-4 py-2 rounded-2xl border border-primary/20 animate-in fade-in slide-in-from-top-4">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <span className="text-xs font-black text-primary uppercase tracking-tighter">
              Impersonation Mode
            </span>
            <div className="w-px h-4 bg-primary/20 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-[10px] font-black uppercase tracking-widest bg-primary text-white hover:bg-primary/90 rounded-lg flex items-center gap-2"
              onClick={handleEndImpersonation}
            >
              <LogOut className="h-3 w-3" />
              End Session
            </Button>
          </div>
        ) : (
          <div className="relative w-full max-w-md hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search records, stores or medicines..."
              className="pl-10 bg-muted/50 border-none focus-visible:ring-primary"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <ModeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full animate-pulse" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80 rounded-2xl p-2 shadow-2xl border-none"
          >
            <div className="flex items-center justify-between p-3">
              <DropdownMenuLabel className="font-black text-lg p-0">
                Notifications
              </DropdownMenuLabel>
              {unreadCount > 0 && (
                <Badge className="bg-primary/10 text-primary border-none rounded-full px-2">
                  {unreadCount} New
                </Badge>
              )}
            </div>
            <DropdownMenuSeparator className="bg-muted/50" />
            <div className="max-h-[400px] overflow-y-auto space-y-1 my-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm font-medium">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    className="flex flex-col items-start gap-1 p-3 cursor-pointer rounded-xl hover:bg-muted/50 transition-colors"
                    onClick={() => onSetActiveTab("notifications")}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Badge
                        variant="outline"
                        className={`
                        text-[10px] font-black border-none px-2 py-0.5 rounded-full
                        ${
                          n.type === "success"
                            ? "bg-emerald-100 text-emerald-700"
                            : n.type === "warning"
                              ? "bg-amber-100 text-amber-700"
                              : n.type === "error"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-blue-100 text-blue-700"
                        }
                      `}
                      >
                        {n.type?.toUpperCase() || "INFO"}
                      </Badge>
                      <span className="text-[10px] font-bold text-muted-foreground ml-auto flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {n.time}
                      </span>
                    </div>
                    <p className="text-sm font-black text-foreground">
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground font-medium line-clamp-2">
                      {n.description}
                    </p>
                  </DropdownMenuItem>
                ))
              )}
            </div>
            <DropdownMenuSeparator className="bg-muted/50" />
            <DropdownMenuItem
              className="w-full text-center text-xs text-primary font-black justify-center py-3 cursor-pointer hover:bg-primary/5 rounded-xl"
              onClick={() => onSetActiveTab("notifications")}
            >
              View All Notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button className="lg:hidden" variant="ghost" size="icon">
          <Menu className="h-6 w-6" />
        </Button>
      </div>
    </header>
  );
}
