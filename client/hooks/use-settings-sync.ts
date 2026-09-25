import { useState } from "react";
import { toast } from "sonner";
import { APP_NAME } from "@/lib/constants";
import {
  getDatabaseBinary,
  restoreDatabase,
  restorePreRestoreSnapshot,
  resetDatabase,
  isTauri,
  backupDatabaseToFile,
  restoreDatabaseFromFile,
  logAction,
  getActiveStoreId,
} from "@/lib/db/core";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import { sync, syncSubscriptionStatus, forceFullResync } from "@/lib/db/sync-engine";
import { markRestoredForCloudLinkNotice } from "@/lib/utils/post-restore-notice";
import { clearToken } from "@/lib/api/token-manager";

export function useSettingsSync(
  isCloudLinked: boolean,
  refetchStore: () => Promise<unknown>
) {
  const [isCloudLinkOpen, setIsCloudLinkOpen] = useState(false);
  const [syncAfterLink, setSyncAfterLink] = useState(false);

  const handleSync = async (forceStart?: boolean) => {
    if (!isCloudLinked && forceStart !== true) {
      setSyncAfterLink(true);
      setIsCloudLinkOpen(true);
      return;
    }

    try {
      await syncSubscriptionStatus();
      await refetchStore();
    } catch (_e) {
      // Non-fatal
    }

    toast.promise(sync(true), {
      loading: "Synchronizing data with cloud...",
      success: (data) => {
        refetchStore();
        return `Sync complete! Pushed ${data.pushed}, Pulled ${data.pulled}`;
      },
      error: "Sync failed. Please check your connection.",
    });
  };

  // Recovery path for a device whose pull cursor has drifted ahead of
  // content it never actually received (e.g. a mid-round crash) — every
  // ordinary sync since then has "succeeded" while silently never re-
  // fetching the missed rows, since a stuck cursor gives no error to act
  // on. Clears the local pull cursor and re-fetches every table from
  // scratch; never touches local data or this device's own pending
  // outbound changes. See lib/db/sync-engine/index.ts's forceFullResync.
  const handleForceFullResync = async () => {
    if (!isCloudLinked) return;

    toast.promise(forceFullResync(), {
      loading: "Re-downloading all data from the cloud...",
      success: (data) => {
        refetchStore();
        return `Resync complete! Pushed ${data.pushed}, Pulled ${data.pulled}`;
      },
      error: "Resync failed. Please check your connection.",
    });
  };

  const handleDownloadBackup = async () => {
    if (isTauri()) {
      try {
        const result = await backupDatabaseToFile();
        if (result.success) {
          toast.success(`Backup saved to ${result.path}`);
        }
        // result.success === false with no error means the user just closed
        // the save dialog without picking a destination; nothing to report.
      } catch (err) {
        console.error("Failed to back up database:", err);
        toast.error("Failed to export database");
      }
      return;
    }

    const binary = getDatabaseBinary();
    if (!binary) {
      toast.error("Failed to export database");
      return;
    }
    // TS's DOM lib expects ArrayBufferView<ArrayBuffer>, but sql.js's Uint8Array
    // is typed against the wider ArrayBufferLike (functionally a valid BlobPart).
    const blob = new Blob([binary as BlobPart], { type: "application/x-sqlite3" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toISOString().split("T")[1].slice(0, 8).replace(/:/g, "-");
    link.download = `${APP_NAME.toLowerCase()}_backup_${dateStr}_${timeStr}.drx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded successfully");
  };

  const handleRestoreBackupTauri = async () => {
    try {
      const result = await restoreDatabaseFromFile();
      if (result.success) {
        toast.success("Database restored successfully. Restarting app...");
        markRestoredForCloudLinkNotice();
        setTimeout(() => window.location.reload(), 1500);
      }
      // result.success === false with no error means the user cancelled the
      // open dialog; nothing to report.
    } catch (err) {
      console.error("Failed to restore database:", err);
      toast.error("Failed to restore database. Invalid file?");
    }
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => {
      toast.error("Failed to read the selected file. Please try again.");
    };
    reader.onload = async (e) => {
      const result = e.target?.result;
      if (result instanceof ArrayBuffer) {
        try {
          const { snapshotSucceeded } = await restoreDatabase(new Uint8Array(result));
          if (!snapshotSucceeded) {
            toast.warning(
              "Restored, but couldn't save a pre-restore backup - \"Undo Last Restore\" won't be available for this one.",
            );
          }
          toast.success("Database restored successfully. Page will reload.");
          markRestoredForCloudLinkNotice();
          setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
          // Surfaces restoreDatabase()'s actual validation message (e.g.
          // "missing tables: ...") instead of a generic one, so a rejected
          // restore tells the user WHY rather than just "invalid file".
          toast.error(err instanceof Error ? err.message : "Failed to restore database. Invalid file?");
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Undoes the most recent restoreDatabase() call (web only) by recovering
  // the snapshot it took of the outgoing database right before overwriting
  // it. Exists so that safety net is actually reachable from the UI, not
  // just present in the code - see restorePreRestoreSnapshot()'s doc comment.
  const handleUndoLastRestore = async () => {
    try {
      const recovered = await restorePreRestoreSnapshot();
      if (!recovered) {
        toast.error("No previous restore to undo.");
        return;
      }
      toast.success("Restore undone. Page will reload.");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to undo the last restore.");
    }
  };

  const handleResetDatabase = async () => {
    // Record who did this before anything else: resetDatabase() wipes
    // audit_logs itself, so this is the only chance for the action to leave
    // a trace anywhere. logAction() also enqueues it into _sync_queue, so
    // if this device is cloud-linked, force an immediate sync to push it
    // (and anything else pending) to the server right now - waiting for the
    // next scheduled auto-sync isn't an option, since clearToken() below
    // disconnects this device from sync entirely. Best-effort: if the push
    // fails (e.g. offline), the reset still proceeds - the confirming PIN
    // entry already established who authorized it, this is belt-and-braces
    // durability for that record, not a precondition for the reset itself.
    try {
      await logAction(AUDIT_ACTIONS.FACTORY_RESET, "stores", getActiveStoreId() || "unknown", {
        cloud_linked: isCloudLinked,
      });
      if (isCloudLinked) {
        await sync(true);
      }
    } catch (err) {
      console.error("Failed to record factory reset audit log:", err);
    }

    // Disconnect cloud sync before wiping local tables, not after: resetDatabase()
    // ends in a window.location.reload(), and this device's mount-time auto-sync
    // effect (store-context.tsx) would otherwise immediately re-pull every
    // just-cleared table straight back down from the server, undoing the reset
    // within a second of it finishing. Clearing the token here means that
    // effect finds no auth_token and skips, same as any other signed-out device.
    // The user can re-link (Settings > Data > "Link & Sync") whenever they want
    // this device syncing again - their cloud account itself is untouched.
    clearToken();
    await resetDatabase();
    toast.success("Database reset successfully.");
  };

  return {
    isCloudLinkOpen,
    setIsCloudLinkOpen,
    syncAfterLink,
    setSyncAfterLink,
    handleSync,
    handleForceFullResync,
    handleDownloadBackup,
    handleRestoreBackup,
    handleRestoreBackupTauri,
    handleUndoLastRestore,
    handleResetDatabase,
    isTauri: isTauri(),
  };
}
