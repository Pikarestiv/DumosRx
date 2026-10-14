"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDeleteStockReportMutation,
  useSetDeviceNicknameMutation,
} from "@/lib/api/admin-hooks-sync";
import { useAdminAuthStore, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";

interface DeviceRowActionsProps {
  storeId: string;
  deviceId: string;
  deviceLabel?: string | null;
  deviceNickname?: string | null;
}

export function DeviceRowActions({
  storeId,
  deviceId,
  deviceLabel,
  deviceNickname,
}: DeviceRowActionsProps) {
  const { user } = useAdminAuthStore();
  const remove = useDeleteStockReportMutation(storeId);
  const rename = useSetDeviceNicknameMutation(storeId);
  const [confirming, setConfirming] = useState(false);
  const [naming, setNaming] = useState(false);
  const [nickname, setNickname] = useState(deviceNickname ?? "");

  // Both routes are role:super_admin while the panel itself is
  // view_platform_health — hidden, not disabled, as with DeviceReportAction.
  if (!checkIsSuperAdmin(user?.role)) {
    return null;
  }

  const saveNickname = () =>
    rename.mutate(
      { deviceId, nickname },
      {
        onSuccess: () => {
          setNaming(false);
          toast.success(nickname.trim() ? `Device named "${nickname.trim()}"` : "Device name cleared");
        },
        onError: () => toast.error("Could not rename that device"),
      },
    );

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        title="Name this device"
        onClick={() => {
          setNickname(deviceNickname ?? "");
          setNaming(true);
        }}
      >
        <Pencil className="h-4 w-4" />
      </Button>

      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0 text-destructive"
        title="Delete this device's report"
        disabled={remove.isPending}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name this device</DialogTitle>
            <DialogDescription>
              Shown wherever {deviceId} appears in admin. Leave it blank to go back to the
              device&apos;s own reported name.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nickname}
            maxLength={60}
            placeholder={deviceLabel ?? "e.g. Front counter till"}
            onChange={(event) => setNickname(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && saveNickname()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button onClick={saveNickname} disabled={rename.isPending}>
              {rename.isPending ? "Saving…" : "Save name"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this device's stock report?"
        description={`${deviceLabel ?? deviceId} disappears from this panel. If the device still syncs, it reports again on its next report request.`}
        confirmLabel="Delete report"
        onConfirm={() =>
          remove.mutate(deviceId, {
            onSuccess: () => toast.success("Report deleted"),
            onError: () => toast.error("Could not delete that report"),
          })
        }
      />
    </>
  );
}
