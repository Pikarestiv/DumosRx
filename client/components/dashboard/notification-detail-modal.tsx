"use client";

import { AlertTriangle, CheckCircle2, Megaphone, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";

export interface NotificationDetail {
  title: string;
  description: string;
  time: string;
  type: string;
}

interface Props {
  notification: NotificationDetail | null;
  onClose: () => void;
}

interface NotificationTypeStyle {
  icon: ReactNode;
  accent: string;
}

const NOTIFICATION_TYPE_STYLES = new Map<string, NotificationTypeStyle>([
  ["danger", { icon: <ShieldAlert className="h-4 w-4" />, accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400" }],
  ["warning", { icon: <AlertTriangle className="h-4 w-4" />, accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }],
  ["success", { icon: <CheckCircle2 className="h-4 w-4" />, accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }],
]);

const DEFAULT_TYPE_STYLE: NotificationTypeStyle = {
  icon: <Megaphone className="h-4 w-4" />,
  accent: "bg-primary/10 text-primary",
};

const styleFor = (type?: string): NotificationTypeStyle =>
  (type ? NOTIFICATION_TYPE_STYLES.get(type) : undefined) ?? DEFAULT_TYPE_STYLE;

export function NotificationDetailModal({ notification, onClose }: Props) {
  const typeStyle = styleFor(notification?.type);

  return (
    <ResponsiveModal
      open={!!notification}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        <span className="flex items-start gap-2">
          <span
            className={`flex items-center justify-center p-1.5 rounded-lg shrink-0 ${typeStyle.accent}`}
          >
            {typeStyle.icon}
          </span>
          <span className="pt-0.5">{notification?.title}</span>
        </span>
      }
      description={notification?.time}
      className="sm:max-w-lg"
    >
      <p className="text-sm leading-relaxed text-foreground whitespace-pre-line break-words">
        {notification?.description}
      </p>
    </ResponsiveModal>
  );
}
