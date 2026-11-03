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
import {
  sync,
  syncSubscriptionStatus,
  forceFullResync,
} from "@/lib/db/sync-engine";
import { failUnlessSucceeded } from "@/lib/db/sync-engine/sync-outcome";
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

    toast.promise(failUnlessSucceeded(sync(true)), {
      loading: "Synchronizing data with cloud...",
      success: (data) => {
        void refetchStore();
        return `Sync complete! Pushed ${data.pushed}, Pulled ${data.pulled}`;
      },
      error: (err: Error) => err.message || "Sync failed. Please check your connection.",
    });
  };

  // Clears the pull cursor and re-fetches every table; never touches local data or pending outbound changes.
  // Rationale: docs/CLIENT_COMMENTS.md#block-hooks-use-settings-sync-ts-L55
  const handleForceFullResync = () => {
    if (!isCloudLinked) return;

    toast.promise(failUnlessSucceeded(forceFullResync()), {
      loading: "Re-downloading all data from the cloud...",
      success: (data) => {
        void refetchStore();
        return `Resync complete! Pushed ${data.pushed}, Pulled ${data.pulled}`;
      },
      error: (err: Error) => err.message || "Resync failed. Please check your connection.",
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

  const handleRestoreBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
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
          // Surfaces restoreDatabase()'s own validation message rather than a generic one.
          // Rationale: docs/CLIENT_COMMENTS.md#block-hooks-use-settings-sync-ts-L150
          toast.error(err instanceof Error ? err.message : "Failed to restore database. Invalid file?");
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Undoes the last restoreDatabase() (web only) from the snapshot it took first.
  // Rationale: docs/CLIENT_COMMENTS.md#block-hooks-use-settings-sync-ts-L160
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
    // Recorded and pushed first: resetDatabase() wipes audit_logs and clearToken() below ends sync.
    // Rationale: docs/CLIENT_COMMENTS.md#block-hooks-use-settings-sync-ts-L179
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

    // Unlinked before the wipe, or the reload's auto-sync would re-pull every cleared table.
    // Rationale: docs/CLIENT_COMMENTS.md#block-hooks-use-settings-sync-ts-L200
    clearToken();
    // Lazy import: the draft stores pull in the whole POS cart module graph.
    // Rationale: docs/CLIENT_COMMENTS.md#block-hooks-use-settings-sync-ts-L209
    try {
      const { clearLocalDrafts } = await import(
        "@/lib/utils/clear-local-drafts"
      );
      clearLocalDrafts();
    } catch (err) {
      console.warn("Failed to clear local drafts before reset", err);
    }
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
