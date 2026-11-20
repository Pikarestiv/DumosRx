"use client";

import { useState, useMemo, type ComponentProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { useIsTouchDevice } from "@/lib/hooks/use-is-touch-device";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useBroadcasts } from "@/lib/hooks/use-broadcasts";
import { NotificationDetailModal } from "./notification-detail-modal";
import { queryKeys } from "@/lib/query-keys";
import { usePayablesDue } from "@/lib/hooks/use-payables-due";
import { buildPayableAlerts } from "@/lib/hooks/payable-alerts";
import type { Broadcast } from "@/lib/types/broadcast";
import { NotificationItemRow } from "./notification-item-row";
import type { NotificationItem } from "./format-notification";

function loadReadBroadcastIds(storageKey: string | null): string[] {
  if (!storageKey) return [];
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

const NotificationsEmptyState = () => (
  <EmptyState icon={Bell} title="No notifications" />
);

const NotificationTrigger = ({
  unreadCount,
  ...props
}: { unreadCount: number } & ComponentProps<typeof Button>) => (
  <Button
    variant="ghost"
    size="icon"
    className="relative"
    aria-label={
      unreadCount > 0
        ? `Notifications, ${unreadCount} unread`
        : "Notifications"
    }
    {...props}
  >
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
  const queryClient = useQueryClient();
  const { data: broadcastsData } = useBroadcasts(storeProfile?.id);
  const payablesDue = usePayablesDue();
  const { data: cloudNotifications = [] } = useQuery({
    ...queryKeys.notifications.all(storeProfile?.id),
    queryFn: async () => {
      const data = await apiClient.getNotifications();
      return Array.isArray(data) ? (data as NotificationItem[]) : [];
    },
    enabled: !!user && !!isCloudLinked,
    refetchInterval: 60000,
  });
  const readBroadcastsStorageKey = storeProfile?.id
    ? `dumosrx.readBroadcastIds.${storeProfile.id}`
    : null;
  const hydrated = useHydrated();
  const loadedBroadcastsKey = hydrated ? readBroadcastsStorageKey : null;
  const [readBroadcasts, setReadBroadcasts] = useState<{ key: string | null; ids: string[] }>({
    key: null,
    ids: [],
  });
  if (readBroadcasts.key !== loadedBroadcastsKey) {
    setReadBroadcasts({ key: loadedBroadcastsKey, ids: loadReadBroadcastIds(loadedBroadcastsKey) });
  }
  const readBroadcastIds = readBroadcasts.ids;
  const { onOpen } = useOnlineOrdersModal();
  const isTouchDevice = useIsTouchDevice();
  const [open, setOpen] = useState(false);
  const [detailNotification, setDetailNotification] = useState<NotificationItem | null>(null);

  const notifications = useMemo(() => {
    const finalBroadcasts = Array.isArray(broadcastsData) ? broadcastsData : [];
    const standardBroadcasts = finalBroadcasts
      .filter((b: Broadcast) => b.type !== "danger" && b.type !== "warning")
      .map((b: Broadcast) => ({
        id: `broadcast-${b.id}`,
        title: b.title,
        description: b.message,
        time: "System Broadcast",
        type: b.type,
        isRead: readBroadcastIds.includes(`broadcast-${b.id}`),
        category: "broadcast",
      }));
    const payableNotifications = buildPayableAlerts(payablesDue, storeProfile?.currency).map((alert) => ({
      id: alert.id,
      title: alert.title,
      description: alert.description,
      time: alert.priority === "critical" ? "Overdue" : "Due soon",
      type: alert.priority === "critical" ? "danger" : "warning",
      isRead: false,
      category: "payable",
      link: alert.actionRoute,
    }));
    return [...payableNotifications, ...standardBroadcasts, ...cloudNotifications];
  }, [broadcastsData, cloudNotifications, readBroadcastIds, payablesDue, storeProfile?.currency]);

  const markAsRead = async (id: string) => {
    if (id.startsWith("payables-")) return;
    try {
      if (id.startsWith("broadcast-")) {
        setReadBroadcasts((prev) => {
          if (prev.ids.includes(id)) return prev;
          const next = { ...prev, ids: [...prev.ids, id] };
          if (readBroadcastsStorageKey) {
            try {
              localStorage.setItem(readBroadcastsStorageKey, JSON.stringify(next.ids));
            } catch (e) {
              console.error("Failed to persist read broadcast id", e);
            }
          }
          return next;
        });
        return;
      }
      await apiClient.markNotificationRead(id);
      queryClient.setQueryData<NotificationItem[]>(
        queryKeys.notifications.all(storeProfile?.id).queryKey,
        (prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch (e) {
      console.error(e);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllAsRead = async () => {
    const unreadBroadcastIds = notifications
      .filter((n) => !n.isRead && n.id.startsWith("broadcast-"))
      .map((n) => n.id);
    if (unreadBroadcastIds.length > 0) {
      setReadBroadcasts((prev) => {
        const next = { ...prev, ids: Array.from(new Set([...prev.ids, ...unreadBroadcastIds])) };
        if (readBroadcastsStorageKey) {
          try {
            localStorage.setItem(readBroadcastsStorageKey, JSON.stringify(next.ids));
          } catch (e) {
            console.error("Failed to persist read broadcast ids", e);
          }
        }
        return next;
      });
    }

    try {
      await apiClient.markAllNotificationsRead();
    } catch (e) {
      console.error(e);
    }

    queryClient.setQueryData<NotificationItem[]>(
      queryKeys.notifications.all(storeProfile?.id).queryKey,
      (prev) => (prev ?? []).map((n) => ({ ...n, isRead: true })),
    );
  };

  const handleNotificationClick = (notif: NotificationItem) => {
    void markAsRead(notif.id);
    setOpen(false);
    if (notif.type === "online_order" || notif.title.includes("Online Order")) {
      onOpen();
    } else if (notif.link) {
      router.push(notif.link);
    } else {
      setDetailNotification(notif);
    }
  };

  const detailModal = (
    <NotificationDetailModal
      notification={detailNotification}
      onClose={() => setDetailNotification(null)}
    />
  );

  const headerControls = (
    <div className="flex items-center justify-between w-full px-4 py-3 border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <span className="font-serif font-bold text-base text-foreground">Notifications</span>
        {unreadCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
            {unreadCount} Unread
          </span>
        )}
      </div>
      {unreadCount > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleMarkAllAsRead();
          }}
          className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700/60 transition-colors"
        >
          Mark all as read
        </button>
      )}
    </div>
  );

  if (!isTouchDevice) {
    return (
      <>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <NotificationTrigger unreadCount={unreadCount} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[390px] sm:w-[420px] p-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
          >
            {headerControls}
            <div className="max-h-[460px] overflow-y-auto">
              {notifications.length === 0 ? (
                <NotificationsEmptyState />
              ) : (
                notifications.map((notif) => (
                  <DropdownMenuItem
                    key={notif.id}
                    className="p-0 focus:bg-transparent cursor-pointer focus:outline-none rounded-none"
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <NotificationItemRow notif={notif} />
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        {detailModal}
      </>
    );
  }

  return (
    <>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <NotificationTrigger unreadCount={unreadCount} />
        </DrawerTrigger>
        <DrawerContent
          className="max-h-[85vh] p-0 pb-6 rounded-t-2xl bg-white dark:bg-slate-900"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DrawerHeader className="p-0 text-left">
            <DrawerTitle className="sr-only">Notifications</DrawerTitle>
            {headerControls}
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-3 mt-2">
            {notifications.length === 0 ? (
              <NotificationsEmptyState />
            ) : (
              notifications.map((notif) => (
                <NotificationItemRow
                  key={notif.id}
                  notif={notif}
                  isDrawer={true}
                  onClick={() => handleNotificationClick(notif)}
                />
              ))
            )}
          </div>
        </DrawerContent>
      </Drawer>
      {detailModal}
    </>
  );
}
