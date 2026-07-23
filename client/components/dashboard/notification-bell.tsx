"use client";

import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { apiClient } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useOnlineOrdersModal } from "@/lib/store/use-online-orders-modal";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: string;
  isRead: boolean;
  category: string;
  link?: string | null;
}

const NotificationItemContent = ({ notif }: { notif: NotificationItem }) => (
  <>
    <div className="flex justify-between w-full text-sm">
      <span className="font-semibold">{notif.title}</span>
      <span className="text-xs opacity-80">{notif.time}</span>
    </div>
    <span className="text-sm opacity-90 line-clamp-2">
      {notif.description}
    </span>
  </>
);

const NotificationTrigger = ({ unreadCount }: { unreadCount: number }) => (
  <Button variant="ghost" size="icon" className="relative">
    <Bell className="h-5 w-5" />
    {unreadCount > 0 && (
      <Badge 
        variant="destructive" 
        className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full"
      >
        {unreadCount}
      </Badge>
    )}
  </Button>
);

export function NotificationBell() {
  const { user, isCloudLinked } = useAuth();
  const { storeProfile } = useStore();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const { onOpen } = useOnlineOrdersModal();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const [notifsData, broadcastsData] = await Promise.all([
        isCloudLinked ? apiClient.getNotifications().catch(() => []) : Promise.resolve([]),
        apiClient.getBroadcasts(storeProfile?.id).catch(() => [])
      ]);

      let finalBroadcasts: any[] = [];
      if (broadcastsData && (broadcastsData as any).success && Array.isArray((broadcastsData as any).data)) {
        finalBroadcasts = (broadcastsData as any).data;
      } else if (Array.isArray(broadcastsData)) {
        finalBroadcasts = broadcastsData;
      }

      const standardBroadcasts = finalBroadcasts
        .filter(b => b.type !== 'danger' && b.type !== 'warning')
        .map(b => ({
          id: `broadcast-${b.id}`,
          title: b.title,
          description: b.message,
          time: 'System Broadcast',
          type: b.type,
          isRead: false,
          category: 'broadcast'
        }));

      setNotifications([...standardBroadcasts, ...(Array.isArray(notifsData) ? notifsData : [])]);
    } catch (e) {
      console.error("Failed to fetch notifications", e);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, [user]);

  const markAsRead = async (id: string) => {
    try {
      if (id.startsWith('broadcast-')) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        return;
      }
      await apiClient.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (e) {
      console.error(e);
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleNotificationClick = (notif: NotificationItem) => {
    markAsRead(notif.id);
    setOpen(false);
    if (notif.type === 'online_order' || notif.title.includes('Online Order')) {
      onOpen();
    } else if (notif.link) {
      router.push(notif.link);
    }
  };

  const EmptyState = () => (
    <div className="p-8 text-center text-sm text-muted-foreground">
      No notifications
    </div>
  );

  if (isDesktop) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <div>
            <NotificationTrigger unreadCount={unreadCount} />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
                                  <EmptyState />
                                )}
                    {!(notifications.length === 0) && (
                                  notifications.map((notif) => (
                                    <DropdownMenuItem 
                                      key={notif.id} 
                                      className={cn(
                                        "flex flex-col items-start gap-1 p-3 cursor-pointer",
                                        notif.isRead ? "opacity-70" : "bg-primary/5 font-medium"
                                      )}
                                      onClick={() => handleNotificationClick(notif)}
                                    >
                                      <NotificationItemContent notif={notif} />
                                    </DropdownMenuItem>
                                  ))
                                )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <div>
          <NotificationTrigger unreadCount={unreadCount} />
        </div>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh] p-0 pb-6 rounded-t-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DrawerHeader className="px-6 pt-2 pb-2 text-left">
          <DrawerTitle className="font-serif font-black text-2xl">Notifications</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 mt-2">
          {notifications.length === 0 && (
                              <EmptyState />
                            )}
                  {!(notifications.length === 0) && (
                              <div className="space-y-2">
                                {notifications.map((notif) => (
                                  <button
                                    key={notif.id}
                                    onClick={() => handleNotificationClick(notif)}
                                    className={cn(
                                      "w-full text-left flex flex-col items-start gap-1 p-4 rounded-xl transition-colors",
                                      notif.isRead 
                                        ? "bg-muted/50 text-muted-foreground hover:bg-muted" 
                                        : "bg-primary/10 text-foreground hover:bg-primary/15"
                                    )}
                                  >
                                    <NotificationItemContent notif={notif} />
                                  </button>
                                ))}
                              </div>
                            )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
