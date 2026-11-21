"use client";

import { Cloud, Lock, AlertTriangle, RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { CloudAuditSession } from "@/lib/api/audit-sessions";
import { formatDateSafe } from "@/lib/utils/date-utils";

interface AuditCloudBannerProps {
  session: CloudAuditSession | null;
  isReadOnly: boolean;
  conflictMessage: string | null;
  draftResolution?: "pending_sync" | "abandoned" | null;
  isTakeoverOpen: boolean;
  onTakeoverOpenChange: (open: boolean) => void;
  onTakeoverConfirm: () => void;
  isTakingOver: boolean;
  onDiscardAbandonedDraft?: () => void;
  onRestartAbandonedDraft?: () => void;
}

export function AuditCloudPill({
  session,
  isReadOnly,
  lastSyncedAt,
}: {
  session: CloudAuditSession | null;
  isReadOnly: boolean;
  lastSyncedAt: string | null;
}) {
  if (!session) {
    return (
      <div className="hidden md:flex items-center gap-1.5 bg-muted/50 border border-border rounded-full px-3 py-1.5">
        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
        <span className="text-[11.5px] font-semibold text-muted-foreground">
          Saved locally · syncs when online
        </span>
      </div>
    );
  }

  if (isReadOnly) {
    return (
      <div className="hidden md:flex items-center gap-1.5 bg-amber-500/10 border border-amber-200 dark:border-amber-900 rounded-full px-3 py-1.5">
        <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
        <span className="text-[11.5px] font-semibold text-amber-700 dark:text-amber-400">
          Inspection Mode · {session.active_till_name || "Another Till"}
        </span>
      </div>
    );
  }

  const syncTime = formatDateSafe(lastSyncedAt, "dd/MM/yyyy HH:mm", "Just now");

  return (
    <div className="hidden md:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-200 dark:border-emerald-900 rounded-full px-3 py-1.5">
      <Cloud className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
      <span className="text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-400">
        Cloud-backed · Synced {syncTime}
      </span>
    </div>
  );
}

export function AuditCloudInspectionBanner({
  session,
  isReadOnly,
  conflictMessage,
  draftResolution,
  isTakeoverOpen,
  onTakeoverOpenChange,
  onTakeoverConfirm,
  isTakingOver,
  onDiscardAbandonedDraft,
  onRestartAbandonedDraft,
}: AuditCloudBannerProps) {
  if (!session && !conflictMessage) return null;

  return (
    <div className="w-full mb-4 space-y-3">
      {conflictMessage && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-rose-500/10 border border-rose-200 dark:border-rose-900 rounded-2xl text-[13px] text-rose-700 dark:text-rose-400">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{conflictMessage}</span>
          </div>
          {draftResolution === "abandoned" && (
            <div className="flex items-center gap-2 shrink-0">
              {onDiscardAbandonedDraft && (
                <button
                  type="button"
                  onClick={onDiscardAbandonedDraft}
                  className="px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 text-[12px] font-medium hover:bg-rose-500/10 transition-colors"
                >
                  Discard Local Draft
                </button>
              )}
              {onRestartAbandonedDraft && (
                <button
                  type="button"
                  onClick={onRestartAbandonedDraft}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-medium transition-colors"
                >
                  Start New Session
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isReadOnly && session && session.status === "in_progress" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-500/10 border border-amber-200 dark:border-amber-900 rounded-2xl text-[13px] text-amber-800 dark:text-amber-300">
          <div className="flex items-start sm:items-center gap-2.5">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-amber-600 dark:text-amber-400" />
            <div>
              <span className="font-semibold">Inspection Mode:</span> Editing is currently held by{" "}
              <span className="font-semibold underline">
                {session.active_till_name || "Another Till"}
              </span>{" "}
              ({session.counted_items_count} of {session.total_items_count} items counted). Counts on this
              screen are view-only.
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl text-[12.5px] transition-colors flex items-center justify-center gap-1.5"
            onClick={() => onTakeoverOpenChange(true)}
            disabled={isTakingOver}
          >
            {isTakingOver && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Take Over Session
          </button>
        </div>
      )}

      <ConfirmDialog
        open={isTakeoverOpen}
        onOpenChange={onTakeoverOpenChange}
        title="Take over cycle count session?"
        description={`Active counting is currently assigned to ${session?.active_till_name || "another device"}. Taking over will grant editing rights to this till and invalidate editing on the previous device.`}
        confirmLabel={isTakingOver ? "Taking over..." : "Take Over"}
        cancelLabel="Stay in inspection mode"
        variant="default"
        onConfirm={onTakeoverConfirm}
      />
    </div>
  );
}
