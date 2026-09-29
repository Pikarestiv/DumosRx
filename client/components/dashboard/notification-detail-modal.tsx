"use client";

import { AlertTriangle, CheckCircle2, Megaphone, ShieldAlert } from "lucide-react";
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

const getIcon = (type?: string) => {
  switch (type) {
    case "danger":
      return ShieldAlert;
    case "warning":
      return AlertTriangle;
    case "success":
      return CheckCircle2;
    default:
      return Megaphone;
  }
};

const getAccent = (type?: string) => {
  switch (type) {
    case "danger":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
    case "warning":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "success":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    default:
      return "bg-primary/10 text-primary";
  }
};

export function NotificationDetailModal({ notification, onClose }: Props) {
  const Icon = getIcon(notification?.type);

  return (
    <ResponsiveModal
      open={!!notification}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        <span className="flex items-start gap-2">
          <span
            className={`flex items-center justify-center p-1.5 rounded-lg shrink-0 ${getAccent(
              notification?.type,
            )}`}
          >
            <Icon className="h-4 w-4" />
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
