"use client";

import { useState } from "react";
import { RotateCw, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface DataSettingsSyncMaintenanceProps {
  handleForceFullResync: () => void;
  handleReconcileStockQuantities: () => void;
}

/**
 * The two cloud-linked recovery actions in Settings > Data. Split out of
 * data-settings.tsx purely to keep that file under the repo's file-size
 * rule; they share no state with the backup/restore controls there.
 */
export function DataSettingsSyncMaintenance({
  handleForceFullResync,
  handleReconcileStockQuantities,
}: DataSettingsSyncMaintenanceProps) {
  const [showForceResyncConfirm, setShowForceResyncConfirm] = useState(false);
  const [showReconcileConfirm, setShowReconcileConfirm] = useState(false);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Force Full Resync</p>
          <p className="text-sm text-muted-foreground">
            Re-downloads every record from the cloud from scratch, instead of
            only what changed since the last sync. Use this if data on another
            device doesn&apos;t match what this device shows after an ordinary
            sync. Can take a while on a large catalog or a slow connection.
          </p>
        </div>
        <Button
          variant="outline"
          className="cursor-pointer shrink-0"
          onClick={() => setShowForceResyncConfirm(true)}
        >
          <RotateCw className="w-4 h-4 mr-2" />
          Resync
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Health Sync</p>
          <p className="text-sm text-muted-foreground">
            Makes sure this device is fully caught up and in agreement with
            the cloud and every other device on your account. Good to run
            occasionally, especially after being offline for a while.
          </p>
        </div>
        <Button
          variant="outline"
          className="cursor-pointer shrink-0"
          onClick={() => setShowReconcileConfirm(true)}
        >
          <HeartPulse className="w-4 h-4 mr-2" />
          Health Sync
        </Button>
      </div>

      <ConfirmDialog
        open={showForceResyncConfirm}
        onOpenChange={setShowForceResyncConfirm}
        title="Force a full resync?"
        description="Re-downloads every record from the cloud from scratch instead of only recent changes. This device's own not-yet-synced changes are pushed first and are never discarded, but a large catalog can take a while to re-download."
        confirmLabel="Resync Everything"
        onConfirm={() => {
          handleForceFullResync();
        }}
      />

      <ConfirmDialog
        open={showReconcileConfirm}
        onOpenChange={setShowReconcileConfirm}
        title="Run a health sync?"
        description="Fully syncs this device with the cloud, then double-checks every detail agrees. Nothing on this device changes, and a record is kept in your cloud activity log. Takes a few seconds."
        confirmLabel="Run Health Sync"
        onConfirm={() => {
          handleReconcileStockQuantities();
        }}
      />
    </>
  );
}
