"use client";

import { SuspendStoreDialog, BillingHistoryDialog } from "@/components/admin/stores/store-dialogs";
import {
  ArchiveStoreDialog,
  PurgeStoreDialog,
} from "@/components/admin/stores/store-delete-dialogs";
import { SharedGrantTrialDialog } from "@/components/admin/shared-grant-trial-dialog";
import { SharedActivatePlanDialog } from "@/components/admin/shared-activate-plan-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { useStoreDeletionActions } from "@/hooks/use-store-deletion-actions";
import type { useStoreImpersonation } from "@/hooks/use-store-impersonation";
import type { AdminStoreSummary } from "@/lib/types/admin";

interface StoreDialogHostProps {
  selectedStore: AdminStoreSummary | null;
  suspend: { isOpen: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason: string) => void; isPending: boolean };
  trial: { isOpen: boolean; onOpenChange: (open: boolean) => void; onConfirm: (plan: string, duration?: string, endDate?: string) => void; isPending: boolean };
  activatePlan: { isOpen: boolean; onOpenChange: (open: boolean) => void; onConfirm: (plan: string, billingCycle: string, amount: number, reference?: string) => void; isPending: boolean };
  billing: { isOpen: boolean; onOpenChange: (open: boolean) => void };
  deletion: ReturnType<typeof useStoreDeletionActions>;
  impersonation: ReturnType<typeof useStoreImpersonation>;
}

export function StoreDialogHost({
  selectedStore,
  suspend,
  trial,
  activatePlan,
  billing,
  deletion,
  impersonation,
}: StoreDialogHostProps) {
  return (
    <>
      <SuspendStoreDialog
        isOpen={suspend.isOpen}
        onOpenChange={suspend.onOpenChange}
        selectedStore={selectedStore}
        handleSuspend={suspend.onConfirm}
        isPending={suspend.isPending}
      />

      <SharedGrantTrialDialog
        open={trial.isOpen}
        onOpenChange={trial.onOpenChange}
        targetName={selectedStore?.name}
        onConfirm={trial.onConfirm}
        isPending={trial.isPending}
      />

      <SharedActivatePlanDialog
        open={activatePlan.isOpen}
        onOpenChange={activatePlan.onOpenChange}
        targetName={selectedStore?.name}
        onConfirm={activatePlan.onConfirm}
        isPending={activatePlan.isPending}
      />

      <ArchiveStoreDialog
        store={deletion.archiveTarget}
        onOpenChange={(open) => {
          if (!open) deletion.closeArchive();
        }}
        onConfirm={deletion.confirmArchive}
        isPending={deletion.isArchiving}
      />

      <PurgeStoreDialog
        store={deletion.purgeTarget}
        onOpenChange={(open) => {
          if (!open) deletion.closePurge();
        }}
        onConfirm={deletion.confirmPurge}
        isPending={deletion.isPurging}
      />

      <BillingHistoryDialog
        isOpen={billing.isOpen}
        onOpenChange={billing.onOpenChange}
        selectedStore={selectedStore}
      />

      <ConfirmDialog
        open={impersonation.impersonateTarget !== null}
        onOpenChange={(open) => {
          if (!open) impersonation.clearImpersonateTarget();
        }}
        title="Start impersonation session?"
        description={
          impersonation.impersonateTarget
            ? `You will be signed into the app as ${impersonation.impersonateTarget.owner} (${impersonation.impersonateTarget.email}), the owner of ${impersonation.impersonateTarget.name}. Every action you take will be recorded against that account until you return to the admin panel.`
            : ""
        }
        confirmLabel="Impersonate"
        onConfirm={() => {
          if (impersonation.impersonateTarget) {
            impersonation.startImpersonation(impersonation.impersonateTarget);
          }
        }}
      />

      <ConfirmDialog
        open={impersonation.environmentChallenge !== null}
        onOpenChange={(open) => {
          if (!open) impersonation.dismissEnvironmentChallenge();
        }}
        title="Send a handoff code to production?"
        description={impersonation.environmentChallenge?.message ?? ""}
        confirmLabel="Continue anyway"
        onConfirm={impersonation.confirmEnvironmentChallenge}
      />
    </>
  );
}
