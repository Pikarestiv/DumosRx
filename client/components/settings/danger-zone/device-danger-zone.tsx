"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth, checkCanFactoryReset } from "@/lib/context/auth-context";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface DeviceDangerZoneProps {
  isCloudLinked: boolean;
  handleResetDatabase: () => void;
}

/** Wipes only this device's local SQLite/IndexedDB store and disconnects
 * cloud sync. Other devices synced to the same account, and any data
 * already on the server, are untouched — see CloudDangerZone for that. */
export function DeviceDangerZone({
  isCloudLinked,
  handleResetDatabase,
}: DeviceDangerZoneProps) {
  const { verifyPin, user } = useAuth();
  const canFactoryReset = checkCanFactoryReset(user?.role);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            This Device
          </CardTitle>
          <CardDescription>
            Affects only the copy of the data stored on this device/browser.
            Nothing on the server or on your other devices is touched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Factory Reset</p>
              <p className="text-xs text-muted-foreground">
                {isCloudLinked
                  ? "Permanently deletes all local data on this device (products, sales, customers, expenses) and disconnects it from cloud sync. Your staff logins remain, and you can re-link your cloud account afterward. Any data still on the server, or on other devices, is not affected."
                  : "Permanently deletes all local data on this device (products, sales, customers, expenses). Your login account remains. There is no cloud copy to fall back on in local-only mode, so this data cannot be recovered."}
              </p>
            </div>
            {canFactoryReset ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowResetConfirm(true)}
                className="shrink-0"
              >
                Reset This Device
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground italic shrink-0">
                Only the store owner can perform a factory reset.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Factory Reset"
        description={
          isCloudLinked
            ? "This will permanently delete all local data: products, sales, customers, and expenses, and disconnect this device from cloud sync. Your staff logins will remain, and you can re-link your cloud account afterward. This cannot be undone."
            : "This will permanently delete all local data: products, sales, customers, and expenses. Your login account will remain. This cannot be undone."
        }
        confirmLabel="Reset All Data"
        requirePin={true}
        onConfirm={async (pin) => {
          // Re-checked here, not just at the button's render gate above: this
          // dialog's open state is otherwise trusting whatever triggered it.
          if (!canFactoryReset) {
            toast.error("Only the store owner can perform a factory reset.");
            setShowResetConfirm(false);
            return;
          }
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
    </>
  );
}
