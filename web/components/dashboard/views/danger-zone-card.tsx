"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";
import { useDashboard } from "@/app/dashboard/use-dashboard";

export function DangerZoneCard() {
  const { user, refetch } = useDashboard();
  const queryClient = useQueryClient();
  const [isDeletionDialogOpen, setIsDeletionDialogOpen] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");

  const deleteAccountMutation = useMutation({
    mutationFn: (data: { reason: string }) => webApiClient.requestAccountDeletion(data),
    onSuccess: () => {
      toast.success("Account Deletion Requested", {
        description: "Your request has been submitted to the administration.",
      });
      setIsDeletionDialogOpen(false);
      setDeletionReason("");
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to request deletion");
    },
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: () => webApiClient.cancelAccountDeletion(),
    onSuccess: () => {
      toast.success("Request Cancelled", {
        description: "Your account deletion request has been cancelled.",
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to cancel deletion request");
    },
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="md:col-span-2"
      >
        <Card className="bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible and destructive actions for your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white">Delete Account</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Submit a request to permanently delete your account and all associated data.
                </p>
                {user?.deletion_requested_at && (
                  <div className="mt-2 text-xs flex items-center gap-2 bg-amber-500/10 text-amber-700 dark:text-amber-400 p-2.5 rounded-lg border border-amber-500/20">
                    <span>
                      Account deletion requested. If you changed your mind, you can cancel this request:
                    </span>
                    <Button
                      type="button"
                      variant="link"
                      className="text-primary hover:text-primary/80 font-bold p-0 h-auto text-xs underline cursor-pointer"
                      onClick={() => cancelDeletionMutation.mutate()}
                      disabled={cancelDeletionMutation.isPending}
                    >
                      {cancelDeletionMutation.isPending ? "Cancelling..." : "Cancel Request"}
                    </Button>
                  </div>
                )}
              </div>
              <Button
                variant={user?.deletion_requested_at ? "outline" : "destructive"}
                onClick={() => setIsDeletionDialogOpen(true)}
                disabled={!!user?.deletion_requested_at}
              >
                {user?.deletion_requested_at ? "Requested" : "Request Deletion"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={isDeletionDialogOpen} onOpenChange={setIsDeletionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Request Account Deletion
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for deleting your account. An administrator will review your request and permanently delete your account data. This action cannot be undone once processed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for leaving</Label>
              <Textarea
                placeholder="Please tell us why you are leaving..."
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeletionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deletionReason.trim() || deleteAccountMutation.isPending}
              onClick={() => deleteAccountMutation.mutate({ reason: deletionReason })}
            >
              {deleteAccountMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
