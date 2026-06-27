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
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";
import { useDashboard } from "@/app/dashboard/use-dashboard";
import { ConfirmationModal } from "@/components/dashboard/confirmation-modal";

export function DangerZoneCard({ onReset }: { onReset?: (type: string) => Promise<any> }) {
  const { user, refetch } = useDashboard();
  const queryClient = useQueryClient();
  const [isDeletionDialogOpen, setIsDeletionDialogOpen] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");

  const [resetConfig, setResetConfig] = useState<{
    isOpen: boolean;
    type: string;
    title: string;
    description: string;
  }>({
    isOpen: false,
    type: "all",
    title: "",
    description: "",
  });

  const handleResetClick = (type: string) => {
    const configs: Record<string, { title: string; description: string }> = {
      sales: {
        title: "Clear Sales Records",
        description: "Are you sure you want to delete all sales history? This action cannot be undone.",
      },
      logs: {
        title: "Clear Activity Logs",
        description: "This will permanently delete all activity and system logs for your account.",
      },
      inventories: {
        title: "Clear Inventory",
        description: "Are you sure you want to wipe your online inventory stock? You will need to re-sync from your terminals.",
      },
      customers: {
        title: "Clear Customers",
        description: "This will delete all customer records from the cloud database.",
      },
      stores: {
        title: "Clear Terminals",
        description: "Are you sure you want to delete all connected terminals? They will need to re-register to sync data.",
      },
      all: {
        title: "Full Account Reset",
        description: "WARNING: This will delete ALL data (Sales, Logs, Inventory, Customers). This is irreversible.",
      },
    };

    setResetConfig({
      isOpen: true,
      type,
      ...configs[type],
    });
  };

  const confirmReset = async () => {
    if (!onReset) return;
    const res = await onReset(resetConfig.type);
    setResetConfig((prev) => ({ ...prev, isOpen: false }));
    if (res.success) {
      toast.success(res.message || "Data reset successfully");
    } else {
      toast.error(res.error || "Reset failed. Please try again.");
    }
  };

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
          <CardContent className="space-y-8">
            <div className="space-y-4">
              <div className="flex flex-col">
                <h4 className="font-semibold text-slate-900 dark:text-white">Clear Specific Data</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Selectively wipe specific data records from the cloud database.
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs font-bold border-red-200 hover:bg-red-600 hover:text-white dark:border-red-900"
                  onClick={() => handleResetClick("sales")}
                >
                  Clear Sales
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs font-bold border-red-200 hover:bg-red-600 hover:text-white dark:border-red-900"
                  onClick={() => handleResetClick("logs")}
                >
                  Clear Logs
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs font-bold border-red-200 hover:bg-red-600 hover:text-white dark:border-red-900"
                  onClick={() => handleResetClick("inventories")}
                >
                  Clear Inventory
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs font-bold border-red-200 hover:bg-red-600 hover:text-white dark:border-red-900"
                  onClick={() => handleResetClick("customers")}
                >
                  Clear Customers
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs font-bold border-red-200 hover:bg-red-600 hover:text-white dark:border-red-900"
                  onClick={() => handleResetClick("stores")}
                >
                  Clear Terminals
                </Button>
              </div>

              <div className="pt-2">
                <Button 
                  variant="destructive" 
                  className="w-full font-bold gap-2 bg-red-600 hover:bg-red-700"
                  onClick={() => handleResetClick("all")}
                >
                  <Trash2 className="h-4 w-4" />
                  Nuke Everything (Full Reset)
                </Button>
              </div>
            </div>

            <div className="border-t border-red-200 dark:border-red-900/50" />

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

      <ConfirmationModal
        isOpen={resetConfig.isOpen}
        onClose={() => setResetConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmReset}
        title={resetConfig.title}
        description={resetConfig.description}
        variant="destructive"
      />
    </>
  );
}
