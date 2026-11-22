"use client";

import { AlertTriangle, FileText, Key, Megaphone, Rocket, ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import {
  formatNotificationTitle,
  formatNotificationDescription,
  getNotificationBadge,
  type NotificationItem,
} from "./format-notification";
import { cn } from "@/lib/utils";

interface Props {
  notif: NotificationItem;
  onClick?: () => void;
  isDrawer?: boolean;
}

function resolveNotificationIcon(item: NotificationItem): {
  icon: ReactNode;
  containerClass: string;
} {
  const text = `${item.title} ${item.description} ${item.type}`.toLowerCase();

  if (item.category === "payable" || text.includes("overdue") || text.includes("payment")) {
    return {
      icon: <AlertTriangle className="h-4 w-4" />,
      containerClass:
        "bg-rose-50 text-rose-500 border border-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/40",
    };
  }

  if (text.includes("enterprise")) {
    return {
      icon: <Rocket className="h-4 w-4" />,
      containerClass:
        "bg-purple-50 text-purple-600 border border-purple-100 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/40",
    };
  }

  if (text.includes("free trial") || text.includes("subscription")) {
    return {
      icon: <Rocket className="h-4 w-4" />,
      containerClass:
        "bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/40",
    };
  }

  if (text.includes("suspended") || text.includes("warning") || text.includes("danger") || text.includes("error")) {
    return {
      icon: <AlertTriangle className="h-4 w-4" />,
      containerClass:
        "bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/40",
    };
  }

  if (text.includes("relink") || text.includes("till") || text.includes("pin") || text.includes("password")) {
    return {
      icon: <Key className="h-4 w-4" />,
      containerClass:
        "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/50",
    };
  }

  if (text.includes("order") && text.includes("online")) {
    return {
      icon: <ShoppingBag className="h-4 w-4" />,
      containerClass:
        "bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40",
    };
  }

  if (text.includes("po") || text.includes("purchase") || text.includes("stock") || text.includes("batch")) {
    return {
      icon: <FileText className="h-4 w-4" />,
      containerClass:
        "bg-sky-50 text-sky-600 border border-sky-100 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/40",
    };
  }

  return {
    icon: <Megaphone className="h-4 w-4" />,
    containerClass:
      "bg-indigo-50 text-indigo-600 border border-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/40",
  };
}

export function NotificationItemRow({ notif, onClick, isDrawer }: Props) {
  const title = formatNotificationTitle(notif.title);
  const description = formatNotificationDescription(notif.description, notif.title);
  const badge = getNotificationBadge(notif);
  const { icon, containerClass } = resolveNotificationIcon(notif);

  return (
    <div
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 p-3.5 sm:p-4 transition-colors cursor-pointer border-b border-slate-100 dark:border-slate-800/80 last:border-b-0",
        notif.isRead
          ? "bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
          : "bg-blue-50/90 dark:bg-blue-950/45 hover:bg-blue-100/80 dark:hover:bg-blue-950/60",
        isDrawer && "rounded-xl border my-1 border-slate-200/60 dark:border-slate-800"
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          containerClass
        )}
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span
              className={cn(
                "text-sm truncate",
                notif.isRead
                  ? "font-medium text-slate-700 dark:text-slate-300"
                  : "font-semibold text-slate-900 dark:text-slate-100"
              )}
            >
              {title}
            </span>
            {badge && (
              <span
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
                  badge.className
                )}
              >
                {badge.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{notif.time}</span>
            {!notif.isRead && (
              <span
                className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0"
                aria-label="Unread"
              />
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
          {description}
        </p>

        {notif.link && (
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline mt-1.5 inline-block">
            View Details
          </span>
        )}
      </div>
    </div>
  );
}
