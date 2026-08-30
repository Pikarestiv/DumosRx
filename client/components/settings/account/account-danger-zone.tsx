"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import {
  useResetDataMutation,
  useRequestAccountDeletionMutation,
  useCancelAccountDeletionMutation,
} from "@/lib/hooks/use-account-danger-zone-mutations";
import { PasswordConfirmDialog } from "./password-confirm-dialog";

const RESET_TYPES: { type: string; label: string; description: string }[] = [
  { type: "sales", label: "Clear Sales", description: "Permanently delete all sales records from the cloud." },
  { type: "logs", label: "Clear Logs", description: "Permanently delete all activity logs from the cloud." },
  { type: "inventories", label: "Clear Inventory", description: "Permanently delete all products and stock batch records from the cloud." },
  { type: "customers", label: "Clear Customers", description: "Permanently delete all customer records from the cloud." },
  { type: "stores", label: "Clear Terminals", description: "Permanently delete all store/terminal records from the cloud." },
  { type: "all", label: "Nuke Everything (Full Reset)", description: "WARNING: This will delete ALL cloud data (Sales, Logs, Products, Stock Batch, Customers, Stores). This is irreversible." },
];

export function AccountDangerZone() {
  const { data: user } = useCurrentUser();
  const [resetTarget, setResetTarget] = useState<{ type: string; label: string; description: string } | null>(null);
  const [deletionDialogOpen, setDeletionDialogOpen] = useState(false);
  const [reason, setReason] = useState("");

  const resetDataMutation = useResetDataMutation();
  const requestDeletionMutation = useRequestAccountDeletionMutation();
  const cancelDeletionMutation = useCancelAccountDeletionMutation();

  const handleReset = (password: string) => {
    if (!resetTarget) return;
    if (resetDataMutation.isPending) return;
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
            Danger Zone
          </CardTitle>
          <CardDescription>
            These actions affect your cloud account data and cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {RESET_TYPES.map((reset) => (
              <Button
                key={reset.type}
                variant="outline"
                className="justify-start border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setResetTarget(reset)}
              >
                {reset.label}
              </Button>
            ))}
          </div>

          <div className="border-t pt-6">
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
