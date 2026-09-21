"use client";

import { useRef, useState } from "react";
import { Database, CloudOff, Save, Upload, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataSettingsAutoSync } from "./data-settings-auto-sync";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";

const RESTORE_CONFIRM_DESCRIPTION =
  "This will permanently overwrite all data currently on this device (products, sales, customers, and expenses) with the contents of the backup file. This cannot be undone.";

interface DataSettingsProps {
  isCloudLinked: boolean;
  handleSync: () => void;
  setIsCloudLinkOpen: (val: boolean) => void;
  handleDownloadBackup: () => void;
  handleRestoreBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRestoreBackupTauri: () => void;
  handleUndoLastRestore?: () => void;
  isTauri: boolean;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (val: boolean) => void;
  autoSyncInterval: string;
  setAutoSyncInterval: (val: string) => void;
  handleSaveAutoSyncSettings: () => void;
  setSyncAfterLink?: (val: boolean) => void;
}

export function DataSettings({
  isCloudLinked,
  handleSync,
  setIsCloudLinkOpen,
  handleDownloadBackup,
  handleRestoreBackup,
  handleRestoreBackupTauri,
  handleUndoLastRestore,
  isTauri,
  autoSyncEnabled,
  setAutoSyncEnabled,
  autoSyncInterval,
  setAutoSyncInterval,
  handleSaveAutoSyncSettings,
  setSyncAfterLink,
}: DataSettingsProps) {
  const {
    canCloudSync,
    minimumSyncIntervalMinutes,
    withRestriction,
    getUpgradeMessage,
  } = useFeatureGate();

  // Restoring replaces the entire local database, so it gets the same
  // confirm-before-acting treatment as the other destructive actions in
  // Settings. The browser path can only ask *after* the file has been picked
  // (the input's onChange is the first hook we get), so the chosen file is
  // parked here until the user confirms.
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);
  const [showTauriRestoreConfirm, setShowTauriRestoreConfirm] = useState(false);
  const [showUndoRestoreConfirm, setShowUndoRestoreConfirm] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Lets the same file be picked again after a cancel: without this the
  // input's value is unchanged, so re-selecting it fires no onChange.
  const clearRestoreInput = () => {
    if (restoreInputRef.current) restoreInputRef.current.value = "";
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Data Synchronization</CardTitle>
          <CardDescription>
            Manage offline data and cloud backups.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!canCloudSync && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg flex items-start gap-3">
              <CloudOff className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-sm">Cloud Sync is Disabled</p>
                <p className="text-sm">
                  Your current plan does not support cloud backups or
                  multi-device sync.{" "}
                  {getUpgradeMessage(
                    "cloud_sync",
                    "Upgrade your plan to protect your data in the cloud.",
                  )}
                </p>
              </div>
            </div>
          )}

          <div
            className={`flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded-lg bg-muted/30 gap-4`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 ${isCloudLinked ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"} rounded-full flex items-center justify-center`}
              >
                {!!isCloudLinked && <Database className="h-5 w-5" />}
                {!isCloudLinked && <CloudOff className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-medium">
                  {!!isCloudLinked && "Connected to Cloud"}
                  {!isCloudLinked && "Local Mode (Not Linked)"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {!!isCloudLinked &&
                    (() => {
                      const lastSyncTime = localStorage.getItem("last_sync_time");
                      return `Last synced: ${lastSyncTime ? new Date(lastSyncTime).toLocaleString() : "Never"}`;
                    })()}
                  {!isCloudLinked &&
                    "Connect your cloud account to enable sync"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {!isCloudLinked && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSyncAfterLink?.(false);
                    setIsCloudLinkOpen(true);
                  }}
                >
                  Link Account
                </Button>
              )}
              <Button
                variant={isCloudLinked ? "outline" : "default"}
                size="sm"
                onClick={handleSync}
              >
                {!!isCloudLinked && "Sync Now"}
                {!isCloudLinked && "Link & Sync"}
              </Button>
            </div>
          </div>

          <Separator />

          <DataSettingsAutoSync
            canCloudSync={canCloudSync}
            minimumSyncIntervalMinutes={minimumSyncIntervalMinutes}
            autoSyncEnabled={autoSyncEnabled}
            setAutoSyncEnabled={setAutoSyncEnabled}
            autoSyncInterval={autoSyncInterval}
            setAutoSyncInterval={setAutoSyncInterval}
            handleSaveAutoSyncSettings={handleSaveAutoSyncSettings}
          />

          <Separator />

          <div className="space-y-4">
            <h3 className="font-medium">Backup & Restore</h3>
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Download Local Backup</p>
                  <p className="text-sm text-muted-foreground">
                    Save a full copy of this device&apos;s data as a .drx file.
                  </p>
                </div>
                <Button
                  variant="default"
                  className="cursor-pointer shrink-0"
                  onClick={withRestriction(handleDownloadBackup)}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>

              {isTauri ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Restore from File</p>
                    <p className="text-sm text-muted-foreground">
                      Overwrite all data on this device with the contents of a
                      .drx backup file. This cannot be undone.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="cursor-pointer shrink-0"
                    onClick={withRestriction(() =>
                      setShowTauriRestoreConfirm(true),
                    )}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Restore
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Restore from File</p>
                    <p className="text-sm text-muted-foreground">
                      Overwrite all data on this device with the contents of a
                      .drx backup file. This cannot be undone.
                    </p>
                  </div>
                  <div className="relative shrink-0">
                    <Button variant="outline" className="cursor-pointer" asChild>
                      <label htmlFor="restore-db">
                        <Upload className="w-4 h-4 mr-2" />
                        Restore
                      </label>
                    </Button>
                    <input
                      ref={restoreInputRef}
                      type="file"
                      id="restore-db"
                      className="hidden"
                      accept=".drx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setPendingRestoreFile(file);
                      }}
                    />
                  </div>
                </div>
              )}

              {!isTauri && handleUndoLastRestore && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Undo Last Restore</p>
                    <p className="text-sm text-muted-foreground">
                      Recovers this device&apos;s data as it stood immediately
                      before the most recent restore, if one was done this
                      session.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="cursor-pointer shrink-0"
                    onClick={() => setShowUndoRestoreConfirm(true)}
                  >
                    <Undo2 className="w-4 h-4 mr-2" />
                    Undo
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showTauriRestoreConfirm}
        onOpenChange={(open) => {
          setShowTauriRestoreConfirm(open);
        }}
        title="Restore from backup?"
        description={RESTORE_CONFIRM_DESCRIPTION}
        confirmLabel="Choose Backup File"
        onConfirm={() => {
          // Opens its own native file picker, so the file is chosen after
          // this confirmation rather than before it.
          handleRestoreBackupTauri();
        }}
      />

      <ConfirmDialog
        open={pendingRestoreFile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRestoreFile(null);
            clearRestoreInput();
          }
        }}
        title="Restore from backup?"
        description={RESTORE_CONFIRM_DESCRIPTION}
        confirmLabel="Restore Data"
        onConfirm={() => {
          const file = pendingRestoreFile;
          if (!file) return;
          // handleRestoreBackup only reads event.target.files[0]; the input
          // element itself may already have been cleared by the time this
          // runs, so hand it the parked file directly.
          handleRestoreBackup({
            target: { files: [file] },
          } as unknown as React.ChangeEvent<HTMLInputElement>);
          setPendingRestoreFile(null);
          clearRestoreInput();
        }}
      />

      <ConfirmDialog
        open={showUndoRestoreConfirm}
        onOpenChange={setShowUndoRestoreConfirm}
        title="Undo the last restore?"
        description="This will overwrite the current data on this device with whatever was here immediately before the most recent restore. If no restore has been done this session, there's nothing to undo."
        confirmLabel="Undo Restore"
        onConfirm={() => {
          handleUndoLastRestore?.();
        }}
      />
    </>
  );
}
