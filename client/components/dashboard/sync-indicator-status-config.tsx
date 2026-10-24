import { Cloud, CloudOff, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceSafe } from "@/lib/utils/date-utils";
import type { SyncConnectionStatus } from "@/lib/hooks/use-sync-indicator-state";

const SolidAlertCircle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" />
  </svg>
);

interface SyncStatusInputs {
  collapsed: boolean;
  isImpersonating: boolean;
  isSyncInProgress: boolean;
  status: SyncConnectionStatus;
  needsSync: boolean;
  isLinked: boolean;
  isSyncOverdue: boolean;
  errorMessage: string | null;
  pendingCount: number;
  lastSync: string | null;
}

export function getSyncStatusConfig({
  collapsed,
  isImpersonating,
  isSyncInProgress,
  status,
  needsSync,
  isLinked,
  isSyncOverdue,
  errorMessage,
  pendingCount,
  lastSync,
}: SyncStatusInputs) {
  // Impersonation wins over every other state: no sync will run at all.
  const stateKey = isImpersonating
    ? "impersonating"
    : isSyncInProgress
    ? "syncing"
    : status === "offline"
      ? "offline"
      : status === "error"
        ? "error"
        : needsSync
          ? "pending"
          : isLinked
            ? "active"
            : "unlinked";

  const iconClass = cn(
    "transition-all duration-300",
    collapsed ? "h-[18px] w-[18px]" : "h-3 w-3",
  );
  const fillProp = collapsed ? { fill: "currentColor", strokeWidth: 0 } : {};

  const configMap = {
    syncing: {
      label: "Syncing...",
      icon: <RefreshCw className={cn(iconClass, "text-blue-500 animate-spin")} />,
      border: "border-blue-500/50",
      desktopBg: "bg-blue-500/10 hover:bg-blue-500/20",
      mobileBg: "bg-blue-500/10",
      tooltip: "Syncing your changes to the cloud...",
    },
    offline: {
      label: "Offline",
      icon: <CloudOff className={cn(iconClass, "text-muted-foreground")} />,
      border: "border-muted-foreground/30",
      desktopBg: "bg-sidebar-accent/5 hover:bg-sidebar-accent/10",
      mobileBg: "bg-muted/50",
      tooltip: "Offline mode. Changes are saved locally.",
    },
    error: {
      label: "Sync Error",
      icon: collapsed 
        ? <SolidAlertCircle className={cn(iconClass, "text-destructive")} />
        : <AlertCircle className={cn(iconClass, "text-destructive")} />,
      border: "border-destructive/50",
      desktopBg: "bg-destructive/10 hover:bg-destructive/20",
      mobileBg: "bg-destructive/10",
      tooltip: errorMessage || "Sync failed. Please try again.",
    },
    pending: {
      label: isLinked ? "Pending Sync" : "Not Backed Up",
      icon: (
        <Cloud
          className={cn(
            iconClass,
            isSyncOverdue ? "text-destructive animate-pulse" : "text-amber-500",
          )}
          {...fillProp}
        />
      ),
      border: isSyncOverdue ? "border-destructive/50" : "border-amber-500/50",
      desktopBg: isSyncOverdue
        ? "bg-destructive/10 hover:bg-destructive/20"
        : "bg-amber-500/10 hover:bg-amber-500/20",
      mobileBg: isSyncOverdue ? "bg-destructive/10" : "bg-amber-500/10",
      tooltip: isLinked
        ? `${pendingCount} local change${pendingCount > 1 ? "s" : ""} pending sync since ${lastSync ? formatDistanceSafe(lastSync) + " ago" : "a while"}.`
        : `This till is not linked to the cloud, so ${pendingCount} local change${pendingCount > 1 ? "s are" : " is"} not backed up. Re-link it in Settings > Data with the owner's login or a re-link code from the owner (Settings > Account > Sessions & Devices).`,
    },
    active: {
      label: "Cloud Active",
      icon: <Cloud className={cn(iconClass, "text-emerald-500")} {...fillProp} />,
      border: "border-emerald-500/50",
      desktopBg: "bg-sidebar-accent/5 hover:bg-sidebar-accent/10",
      mobileBg: "bg-muted/50",
      tooltip: "Your data is securely backed up to the DumosRx cloud.",
    },
    impersonating: {
      label: "Sync Disabled",
      icon: <CloudOff className={cn(iconClass, "text-muted-foreground")} />,
      border: "border-muted-foreground/30",
      desktopBg: "bg-sidebar-accent/5",
      mobileBg: "bg-muted/50",
      tooltip: "Sync is disabled during an impersonated session. Support access is read-only; nothing is pushed to or pulled from this store's cloud data.",
    },
    unlinked: {
      label: "Not Linked",
      icon: <CloudOff className={cn(iconClass, "text-muted-foreground")} />,
      border: "border-muted-foreground/30",
      desktopBg: "bg-sidebar-accent/5 hover:bg-sidebar-accent/10",
      mobileBg: "bg-muted/50",
      tooltip: "Connect your cloud account to enable backups.",
    },
  } as const;

  return configMap[stateKey];
}
