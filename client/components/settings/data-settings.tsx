"use client";

import { useState } from "react";
import { Database, CloudOff, Save, Upload } from "lucide-react";
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
// import { QuickBooksImportDialog } from "./quickbooks-import-dialog"; // commented out for now
import { DataSettingsAutoSync } from "./data-settings-auto-sync";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useAuth } from "@/lib/context/auth-context";
import { toast } from "sonner";

interface DataSettingsProps {
  isCloudLinked: boolean;
  handleSync: () => void;
  setIsCloudLinkOpen: (val: boolean) => void;
  handleDownloadBackup: () => void;
  handleRestoreBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleResetDatabase: () => void;
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
  handleResetDatabase,
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
  const { verifyPin } = useAuth();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // QuickBooks import commented out for now
  // const [showQBImport, setShowQBImport] = useState(false);
  // const [iifContent, setIifContent] = useState<string | null>(null);
  //
  // const handleIIFUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = e.target.files?.[0];
  //   if (file) {
  //     const reader = new FileReader();
  //     reader.onload = (event) => {
  //       setIifContent(event.target?.result as string);
  //       setShowQBImport(true);
  //     };
  //     reader.readAsText(file);
  //   }
  //   e.target.value = "";
  // };

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
                    `Last synced: ${localStorage.getItem("last_sync_time") ? new Date(localStorage.getItem("last_sync_time")!).toLocaleString() : "Never"}`}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                variant="outline"
                className="w-full justify-start cursor-pointer"
                onClick={withRestriction(handleDownloadBackup)}
              >
                <Save className="w-4 h-4 mr-2" />
                Download Local Backup
              </Button>
              <div className="relative">
                <Button
                  variant="outline"
                  className="w-full justify-start cursor-pointer"
                  asChild
                >
                  <label htmlFor="restore-db">
                    <Upload className="w-4 h-4 mr-2" />
                    Restore from File
                  </label>
                </Button>
                <input
                  type="file"
                  id="restore-db"
                  className="hidden"
                  accept=".drx"
                  onChange={handleRestoreBackup}
                />
              </div>
            </div>
          </div>

          {/* QuickBooks import commented out for now
          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">Import / Migration</h3>
              <span className="text-[10px] uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                Beta
              </span>
            </div>
            <div className="p-4 border rounded-lg bg-card flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">QuickBooks Import</p>
                <p className="text-xs text-muted-foreground">
                  Upload a QuickBooks Backup (.iif) to automatically import your
                  inventory and customer lists.
                </p>
              </div>
              <div className="relative shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  asChild
                >
                  <label htmlFor="qb-import">
                    <Upload className="w-4 h-4 mr-2" />
                    Select .IIF File
                  </label>
                </Button>
                <input
                  type="file"
                  id="qb-import"
                  className="hidden"
                  accept=".iif"
                  onChange={handleIIFUpload}
                />
              </div>
            </div>
          </div>
          */}

          <Separator />

          <div className="space-y-4">
            <h3 className="font-medium text-destructive">Danger Zone</h3>
            <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Factory Reset</p>
                <p className="text-xs text-muted-foreground">
                  Wipe all local data (products, sales, etc.) and start fresh.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowResetConfirm(true)}
              >
                Reset All Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Factory Reset"
        description="This will permanently delete all local data — products, sales, customers, and expenses. Your login account will remain. This cannot be undone."
        confirmLabel="Reset All Data"
        requirePin={true}
        onConfirm={async (pin) => {
          if (!pin) {
            toast.error("PIN is required");
            return;
          }
          const isValid = await verifyPin(pin);
          if (!isValid) {
            toast.error("Invalid PIN");
            return;
          }
          handleResetDatabase();
          setShowResetConfirm(false);
        }}
      />

      {/* QuickBooks import commented out for now
      <QuickBooksImportDialog
        open={showQBImport}
        onOpenChange={setShowQBImport}
        fileContent={iifContent}
        onSuccess={() => setShowQBImport(false)}
      />
      */}
    </>
  );
}
