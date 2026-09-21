"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import {
  useResetDataMutation,
  useRequestAccountDeletionMutation,
  useCancelAccountDeletionMutation,
} from "@/lib/hooks/use-account-danger-zone-mutations";
import { PasswordConfirmDialog } from "../account/password-confirm-dialog";
import { checkCanFactoryReset } from "@/lib/context/auth-context";

const RESET_TYPES: { type: string; label: string; description: string }[] = [
  { type: "sales", label: "Clear Sales", description: "Permanently deletes every sale record on the server (all devices, all time). Products and stock levels are not touched." },
  { type: "logs", label: "Clear Logs", description: "Permanently deletes the server's activity/audit log. Useful for a clean start before go-live, not for day-to-day use." },
  { type: "inventories", label: "Clear Inventory", description: "Permanently deletes every product and stock batch record on the server. Sales history referencing them is not deleted, but will show as missing products." },
  { type: "customers", label: "Clear Customers", description: "Permanently deletes every customer record on the server, including loyalty/credit history attached to them." },
  { type: "stores", label: "Clear Terminals", description: "Permanently deletes every registered store/terminal (device) record. Devices will need to be re-linked." },
  { type: "all", label: "Nuke Everything (Full Reset)", description: "Deletes ALL of the above at once: sales, logs, products, stock batches, customers, and terminals. Equivalent to starting the cloud account over from zero." },
];

/** Deletes data directly on the server - affects every device synced to
 * this account, immediately, with no confirmation step beyond the password
 * dialog below. See DeviceDangerZone for the device-local equivalent,
 * which only affects the device running it. */
export function CloudDangerZone() {
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const canResetCloudData = checkCanFactoryReset(user?.role);
  const [resetTarget, setResetTarget] = useState<{ type: string; label: string; description: string } | null>(null);
  const [deletionDialogOpen, setDeletionDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [showCloudResets, setShowCloudResets] = useState(false);

  const resetDataMutation = useResetDataMutation();
  const requestDeletionMutation = useRequestAccountDeletionMutation();
  const cancelDeletionMutation = useCancelAccountDeletionMutation();

  const handleReset = (password: string) => {
    if (!resetTarget) return;
    if (resetDataMutation.isPending) return;
    // Re-checked here, not just at the button's render gate above: this
    // dialog's open state is otherwise trusting whatever triggered it.
    if (!canResetCloudData) {
      toast.error("Only the store owner can reset cloud data.");
      setResetTarget(null);
      return;
    }
    resetDataMutation.mutate(
      { type: resetTarget.type, password },
      {
        onSuccess: () => {
          toast.success(`${resetTarget.label} completed`);
          setResetTarget(null);
        },
      },
    );
  };

  const handleRequestDeletion = (password: string) => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for the deletion request");
      return;
    }
    if (requestDeletionMutation.isPending) return;
    requestDeletionMutation.mutate(
      { reason: reason.trim(), password },
      {
        onSuccess: () => {
          setDeletionDialogOpen(false);
          setReason("");
        },
      },
    );
  };

  const handleCancelDeletion = () => {
    if (cancelDeletionMutation.isPending) return;
    cancelDeletionMutation.mutate();
  };

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Cloud Data
          </CardTitle>
          <CardDescription>
            These actions delete data directly on the server, affecting
            every device synced to this account. Not the same as This
            Device&apos;s Factory Reset, which only wipes the local copy on
            one device. Cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isUserLoading ? (
            <Skeleton className="h-8 w-56" />
          ) : canResetCloudData ? (
            showCloudResets ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {RESET_TYPES.map((reset) => (
                  <button
                    key={reset.type}
                    type="button"
                    onClick={() => setResetTarget(reset)}
                    className="text-left p-3 rounded-lg border border-destructive/30 hover:bg-destructive/10 transition-colors space-y-1"
                  >
                    <p className="text-sm font-semibold text-destructive">{reset.label}</p>
                    <p className="text-xs text-muted-foreground">{reset.description}</p>
                  </button>
                ))}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setShowCloudResets(true)}
              >
                Show cloud data reset options
              </Button>
            )
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Only the store owner can reset cloud data.
            </p>
          )}

          <div className="border-t pt-6 space-y-1">
            <p className="text-sm font-semibold">Account Deletion</p>
            <p className="text-xs text-muted-foreground pb-2">
              Requests your whole admin account be reviewed and removed by
              a super admin. Not immediate - someone reviews it first, and
              you can cancel the request any time before then.
            </p>
            {user?.deletion_requested_at ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
                <p className="text-sm font-medium">Account deletion requested</p>
                <p className="text-xs text-muted-foreground">
                  Reason: {user.deletion_reason || "No reason provided"}
                </p>
                <Button variant="link" className="h-auto p-0 text-sm" onClick={handleCancelDeletion} disabled={cancelDeletionMutation.isPending}>
                  Cancel Request
                </Button>
              </div>
            ) : (
              <Button variant="destructive" onClick={() => setDeletionDialogOpen(true)}>
                Request Account Deletion
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <PasswordConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title={resetTarget?.label || ""}
        description={resetTarget?.description || ""}
        confirmLabel={resetDataMutation.isPending ? "Resetting..." : "Confirm Reset"}
        isSubmitting={resetDataMutation.isPending}
        onConfirm={handleReset}
      />

      <PasswordConfirmDialog
        open={deletionDialogOpen}
        onOpenChange={setDeletionDialogOpen}
        title="Request Account Deletion"
        description="Your account will be reviewed for deletion. This is not immediate, an admin will process your request."
        confirmLabel={requestDeletionMutation.isPending ? "Submitting..." : "Request Deletion"}
        isSubmitting={requestDeletionMutation.isPending}
        onConfirm={handleRequestDeletion}
        extraField={
          <div className="space-y-2">
            <Label htmlFor="deletion-reason">Reason for deletion</Label>
            <Textarea
              id="deletion-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell us why you're leaving..."
            />
          </div>
        }
      />
    </>
  );
}
