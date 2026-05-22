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
import { useMutation } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";

export function DangerZoneCard() {
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
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to request deletion");
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
              </div>
              <Button
                variant="destructive"
                onClick={() => setIsDeletionDialogOpen(true)}
              >
                Request Deletion
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
