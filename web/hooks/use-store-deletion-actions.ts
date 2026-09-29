import { useState } from "react";
import { toast } from "sonner";
import {
  useArchiveStoreMutation,
  usePurgeStoreMutation,
  useRestoreStoreMutation,
} from "@/lib/api/admin-hooks-stores";
import type { AdminStoreSummary } from "@/lib/types/admin";

/** Wiring for the super-admin-only archive / restore / permanent-delete
 * actions on the Store Fleet page: which store each dialog is aimed at, the
 * mutations behind them, and the toasts. Kept out of the page component,
 * which already owns suspend, demo, trial, plan and impersonation state. */
export function useStoreDeletionActions(onChanged: () => void) {
  const [archiveTarget, setArchiveTarget] = useState<AdminStoreSummary | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<AdminStoreSummary | null>(null);

  const archiveMutation = useArchiveStoreMutation();
  const restoreMutation = useRestoreStoreMutation();
  const purgeMutation = usePurgeStoreMutation();

  const fail = (message: string) => (err: Error) =>
    toast.error("Action Failed", { description: err.message || message });

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;

    archiveMutation.mutate(
      { id: archiveTarget.id, reason: reason || undefined },
      {
        onSuccess: () => {
          toast.success("Store Archived", {
            description: `${archiveTarget.name} is archived and signed out. Nothing was deleted.`,
          });
          setArchiveTarget(null);
          onChanged();
        },
        onError: fail("Failed to archive store."),
      },
    );
  };

  const confirmPurge = (confirmation: string) => {
    if (!purgeTarget) return;

    purgeMutation.mutate(
      { id: purgeTarget.id, confirmation },
      {
        onSuccess: () => {
          toast.success("Store Deleted", {
            description: `${purgeTarget.name} and all of its records were permanently removed.`,
          });
          setPurgeTarget(null);
          onChanged();
        },
        onError: fail("Failed to permanently delete store."),
      },
    );
  };

  const restore = (store: AdminStoreSummary) => {
    if (restoreMutation.isPending) return;

    restoreMutation.mutate(store.id, {
      onSuccess: () => {
        toast.success("Store Restored", { description: `${store.name} is active again.` });
        onChanged();
      },
      onError: fail("Failed to restore store."),
    });
  };

  return {
    archiveTarget,
    purgeTarget,
    handleArchive: setArchiveTarget,
    handlePurge: setPurgeTarget,
    handleRestore: restore,
    closeArchive: () => setArchiveTarget(null),
    closePurge: () => setPurgeTarget(null),
    confirmArchive,
    confirmPurge,
    isArchiving: archiveMutation.isPending,
    isPurging: purgeMutation.isPending,
  };
}
