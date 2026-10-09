"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  useSuspendStoreMutation,
  useUnsuspendStoreMutation,
  useGrantTrialMutation,
  useActivatePlanMutation,
  useMarkStoreDemoMutation,
  useUnmarkStoreDemoMutation,
} from "@/lib/api/admin-hooks";
import { useStoreDeletionActions } from "@/hooks/use-store-deletion-actions";
import { useStoreImpersonation } from "@/hooks/use-store-impersonation";
import type { StoreRowActionHandlers } from "@/components/admin/stores/store-row-actions";
import type { StoreDialogHostProps } from "@/components/admin/stores/store-dialog-host";
import type { AdminStoreSummary } from "@/lib/types/admin";

export interface StoreActions {
  handlers: StoreRowActionHandlers;
  /** Which store has an unsuspend/demo mutation in flight, or null. */
  pendingStoreId: string | null;
  dialogHost: StoreDialogHostProps;
}

export function useStoreActions(onChanged: () => void): StoreActions {
  const [selectedStore, setSelectedStore] = useState<AdminStoreSummary | null>(null);
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
  const [isTrialDialogOpen, setIsTrialDialogOpen] = useState(false);
  const [isActivatePlanDialogOpen, setIsActivatePlanDialogOpen] = useState(false);
  const [isBillingDialogOpen, setIsBillingDialogOpen] = useState(false);

  const suspendMutation = useSuspendStoreMutation();
  const unsuspendMutation = useUnsuspendStoreMutation();
  const grantTrialMutation = useGrantTrialMutation();
  const activatePlanMutation = useActivatePlanMutation();
  const markDemoMutation = useMarkStoreDemoMutation();
  const unmarkDemoMutation = useUnmarkStoreDemoMutation();

  const deletion = useStoreDeletionActions(onChanged);
  const impersonation = useStoreImpersonation();

  // TanStack exposes the in-flight mutation's own `variables` (the store id
  // here), so no extra state is needed to identify the busy row.
  const pendingStoreId =
    (unsuspendMutation.isPending ? unsuspendMutation.variables : undefined) ??
    (markDemoMutation.isPending ? markDemoMutation.variables : undefined) ??
    (unmarkDemoMutation.isPending ? unmarkDemoMutation.variables : undefined) ??
    null;

  const handleSuspend = (reason: string) => {
    if (!selectedStore) return;

    suspendMutation.mutate(
      { id: selectedStore.id, reason },
      {
        onSuccess: () => {
          toast.success("Account Suspended", {
            description: `${selectedStore.name} has been suspended successfully.`,
          });
          setIsSuspendDialogOpen(false);
          setSelectedStore(null);
          onChanged();
        },
        onError: (err) => {
          toast.error("Action Failed", {
            description: err.message || "Failed to suspend store.",
          });
        },
      },
    );
  };

  const handleUnsuspend = (store: AdminStoreSummary) => {
    // Belt-and-braces against a double fire; the row's menu item is already
    // disabled while this runs.
    if (unsuspendMutation.isPending) return;

    unsuspendMutation.mutate(store.id, {
      onSuccess: () => {
        toast.success("Account Re-activated", {
          description: `${store.name} has been re-activated successfully.`,
        });
        onChanged();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to unsuspend store.",
        });
      },
    });
  };

  const handleGrantTrial = (plan: string, duration?: string, endDate?: string) => {
    if (!selectedStore) return;

    grantTrialMutation.mutate(
      { id: selectedStore.id, plan, duration, endDate },
      {
        onSuccess: () => {
          const durationLabel = endDate ? `until ${endDate}` : duration;
          toast.success("Trial Granted", {
            description: `Granted ${durationLabel} ${plan} trial to ${selectedStore.name}.`,
          });
          setIsTrialDialogOpen(false);
          setSelectedStore(null);
          onChanged();
        },
        onError: (err) => {
          toast.error("Action Failed", {
            description: err.message || "Failed to grant trial.",
          });
        },
      },
    );
  };

  const handleActivatePlan = (
    plan: string,
    billingCycle: string,
    amount: number,
    reference?: string,
  ) => {
    if (!selectedStore) return;

    activatePlanMutation.mutate(
      { id: selectedStore.id, plan, billingCycle, amount, reference },
      {
        onSuccess: () => {
          toast.success("Plan Activated", {
            description: `Activated ${billingCycle} ${plan} plan for ${selectedStore.name}.`,
          });
          setIsActivatePlanDialogOpen(false);
          setSelectedStore(null);
          onChanged();
        },
        onError: (err) => {
          toast.error("Action Failed", {
            description: err.message || "Failed to activate plan.",
          });
        },
      },
    );
  };

  const handleToggleDemo = (store: AdminStoreSummary) => {
    const mutation = store.is_demo ? unmarkDemoMutation : markDemoMutation;
    if (mutation.isPending) return;

    mutation.mutate(store.id, {
      onSuccess: () => {
        toast.success(store.is_demo ? "Demo Flag Removed" : "Marked as Demo", {
          description: `${store.name} ${store.is_demo ? "is no longer" : "is now"} flagged as a demo account.`,
        });
        onChanged();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to update demo flag.",
        });
      },
    });
  };

  const handleViewBilling = (store: AdminStoreSummary) => {
    setSelectedStore(store);
    setIsBillingDialogOpen(true);
  };

  return {
    handlers: {
      handleImpersonate: impersonation.handleImpersonate,
      handleViewBilling,
      setSelectedStore,
      setIsSuspendDialogOpen,
      setIsTrialDialogOpen,
      setIsActivatePlanDialogOpen,
      handleUnsuspend,
      handleToggleDemo,
      handleArchive: deletion.handleArchive,
      handleRestore: deletion.handleRestore,
      handlePurge: deletion.handlePurge,
    },
    pendingStoreId,
    dialogHost: {
      selectedStore,
      suspend: {
        isOpen: isSuspendDialogOpen,
        onOpenChange: setIsSuspendDialogOpen,
        onConfirm: handleSuspend,
        isPending: suspendMutation.isPending,
      },
      trial: {
        isOpen: isTrialDialogOpen,
        onOpenChange: setIsTrialDialogOpen,
        onConfirm: handleGrantTrial,
        isPending: grantTrialMutation.isPending,
      },
      activatePlan: {
        isOpen: isActivatePlanDialogOpen,
        onOpenChange: setIsActivatePlanDialogOpen,
        onConfirm: handleActivatePlan,
        isPending: activatePlanMutation.isPending,
      },
      billing: { isOpen: isBillingDialogOpen, onOpenChange: setIsBillingDialogOpen },
      deletion,
      impersonation,
    },
  };
}
