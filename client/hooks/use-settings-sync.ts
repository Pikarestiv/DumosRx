import { useState } from "react";
import { toast } from "sonner";
import { APP_NAME } from "@/lib/constants";
import {
  getDatabaseBinary,
  restoreDatabase,
  resetDatabase,
  isTauri,
  backupDatabaseToFile,
  restoreDatabaseFromFile,
} from "@/lib/db/core";
import { sync, syncSubscriptionStatus } from "@/lib/db/sync-engine";

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
    reader.onload = async (e) => {
      const result = e.target?.result;
      if (result instanceof ArrayBuffer) {
        try {
          await restoreDatabase(new Uint8Array(result));
          toast.success("Database restored successfully. Page will reload.");
          setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
          toast.error("Failed to restore database. Invalid file?");
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleResetDatabase = async () => {
    await resetDatabase();
    toast.success("Database reset successfully.");
  };

  return {
    isCloudLinkOpen,
    setIsCloudLinkOpen,
    syncAfterLink,
    setSyncAfterLink,
    handleSync,
    handleDownloadBackup,
    handleRestoreBackup,
    handleRestoreBackupTauri,
    handleResetDatabase,
    isTauri: isTauri(),
  };
}
