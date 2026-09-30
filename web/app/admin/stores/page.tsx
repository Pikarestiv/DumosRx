"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Download,
  ShieldAlert,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminStores, useSuspendStoreMutation, useUnsuspendStoreMutation, useGrantTrialMutation, useActivatePlanMutation, useMarkStoreDemoMutation, useUnmarkStoreDemoMutation } from "@/lib/api/admin-hooks";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { StoreTable } from "@/components/admin/stores/store-table";
import { StoreToolbar } from "@/components/admin/stores/store-toolbar";
import { StorePagination } from "@/components/admin/stores/store-pagination";
import { SuspendStoreDialog, BillingHistoryDialog } from "@/components/admin/stores/store-dialogs";
import {
  ArchiveStoreDialog,
  PurgeStoreDialog,
} from "@/components/admin/stores/store-delete-dialogs";
import { useStoreDeletionActions } from "@/hooks/use-store-deletion-actions";
import { useStoreImpersonation } from "@/hooks/use-store-impersonation";
import type { AdminStoresArchivedScope } from "@/lib/api/admin-hooks-stores";
import { SharedGrantTrialDialog } from "@/components/admin/shared-grant-trial-dialog";
import { SharedActivatePlanDialog } from "@/components/admin/shared-activate-plan-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { downloadStoreFleetCsv } from "@/lib/admin-store-export";
import { toast } from "sonner";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import type { AdminStoreSummary } from "@/lib/types/admin";

const SEARCH_DEBOUNCE_MS = 300;

export default function StoresManagement() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialSearch = searchParams.get("search") || "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [selectedStore, setSelectedStore] = useState<AdminStoreSummary | null>(null);
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
  const [isTrialDialogOpen, setIsTrialDialogOpen] = useState(false);
  const [isActivatePlanDialogOpen, setIsActivatePlanDialogOpen] = useState(false);
  const [isBillingDialogOpen, setIsBillingDialogOpen] = useState(false);

  const [archivedScope, setArchivedScope] = useState<AdminStoresArchivedScope>("active");

  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

  const { data: response, isLoading, error, refetch } = useAdminStores(
    page,
    debouncedSearch,
    statusFilter === "all" ? "" : statusFilter,
    planFilter === "all" ? "" : planFilter,
    archivedScope
  );
  const suspendMutation = useSuspendStoreMutation();
  const unsuspendMutation = useUnsuspendStoreMutation();
  const grantTrialMutation = useGrantTrialMutation();
  const activatePlanMutation = useActivatePlanMutation();
  const markDemoMutation = useMarkStoreDemoMutation();
  const unmarkDemoMutation = useUnmarkStoreDemoMutation();

  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    if (initialSearch && initialSearch !== search) {
      setSearch(initialSearch);
    }
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (response?.meta?.last_page || 1)) {
      setPage(newPage);
    }
  };

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const storeList = useMemo(() => response?.data ?? [], [response]);
  const storeMeta = response?.meta;

  const deletion = useStoreDeletionActions(() => void refetch());
  const impersonation = useStoreImpersonation();

  // Which row (if any) has an unsuspend/demo mutation in flight. TanStack
  // exposes the in-flight mutation's own `variables` (the store id here),
  // so no extra state is needed to identify the busy row.
  const pendingStoreId =
    (unsuspendMutation.isPending ? unsuspendMutation.variables : undefined) ??
    (markDemoMutation.isPending ? markDemoMutation.variables : undefined) ??
    (unmarkDemoMutation.isPending ? unmarkDemoMutation.variables : undefined) ??
    null;

  const handleSuspend = (reason: string) => {
    if (!selectedStore) return;
    
    suspendMutation.mutate({ id: selectedStore.id, reason }, {
      onSuccess: () => {
        toast.success("Account Suspended", {
          description: `${selectedStore.name} has been suspended successfully.`,
        });
        setIsSuspendDialogOpen(false);
        setSelectedStore(null);
        void refetch();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to suspend store.",
        });
      }
    });
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
        void refetch();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to unsuspend store.",
        });
      }
    });
  };

  const handleGrantTrial = (plan: string, duration?: string, endDate?: string) => {
    if (!selectedStore) return;

    grantTrialMutation.mutate({ id: selectedStore.id, plan, duration, endDate }, {
      onSuccess: () => {
        const durationLabel = endDate ? `until ${endDate}` : duration;
        toast.success("Trial Granted", {
          description: `Granted ${durationLabel} ${plan} trial to ${selectedStore.name}.`,
        });
        setIsTrialDialogOpen(false);
        setSelectedStore(null);
        void refetch();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to grant trial.",
        });
      }
    });
  };

  const handleActivatePlan = (plan: string, billingCycle: string, amount: number, reference?: string) => {
    if (!selectedStore) return;

    activatePlanMutation.mutate({ id: selectedStore.id, plan, billingCycle, amount, reference }, {
      onSuccess: () => {
        toast.success("Plan Activated", {
          description: `Activated ${billingCycle} ${plan} plan for ${selectedStore.name}.`,
        });
        setIsActivatePlanDialogOpen(false);
        setSelectedStore(null);
        void refetch();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to activate plan.",
        });
      }
    });
  };

  const handleToggleDemo = (store: AdminStoreSummary) => {
    const mutation = store.is_demo ? unmarkDemoMutation : markDemoMutation;
    if (mutation.isPending) return;

    mutation.mutate(store.id, {
      onSuccess: () => {
        toast.success(store.is_demo ? "Demo Flag Removed" : "Marked as Demo", {
          description: `${store.name} ${store.is_demo ? "is no longer" : "is now"} flagged as a demo account.`,
        });
        void refetch();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to update demo flag.",
        });
      }
    });
  };

  const handleViewBilling = (store: AdminStoreSummary) => {
    setSelectedStore(store);
    setIsBillingDialogOpen(true);
  };

  if (isLoading && !response) {
    return <AdminSkeleton />;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            Store Fleet
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Manage and monitor all business accounts on the platform
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800"
            onClick={() => {
              if (!downloadStoreFleetCsv(storeList)) {
                toast.error("Nothing to export yet", {
                  description: "This page of the fleet list is empty.",
                });
              }
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Export this page ({storeList.length})
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20"
            onClick={() => router.push("/admin/stores/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            Register Store
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          <StoreToolbar
            search={search}
            onSearchChange={handleSearchChange}
            statusFilter={statusFilter}
            onStatusFilterChange={(val) => { setStatusFilter(val); setPage(1); }}
            planFilter={planFilter}
            onPlanFilterChange={(val) => { setPlanFilter(val); setPage(1); }}
            archivedScope={archivedScope}
            onArchivedScopeChange={(val) => { setArchivedScope(val); setPage(1); }}
            isLoading={isLoading}
            totalShown={storeList.length}
            totalCount={storeMeta?.total || 0}
          />

          <div className="overflow-x-auto min-h-[400px]">
            {error ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <ShieldAlert className="h-10 w-10 text-rose-500" />
                <p className="text-rose-500 font-bold">{error instanceof Error ? error.message : "Sync error"}</p>
                <Button
                  onClick={() => void refetch()}
                  variant="outline"
                >
                  Retry
                </Button>
              </div>
            ) : (
            <StoreTable 
              storeList={storeList}
              isLoading={isLoading}
              handleImpersonate={impersonation.handleImpersonate}
              handleViewBilling={handleViewBilling}
              setSelectedStore={setSelectedStore}
              setIsSuspendDialogOpen={setIsSuspendDialogOpen}
              setIsTrialDialogOpen={setIsTrialDialogOpen}
              setIsActivatePlanDialogOpen={setIsActivatePlanDialogOpen}
              handleUnsuspend={handleUnsuspend}
              handleToggleDemo={handleToggleDemo}
              handleArchive={deletion.handleArchive}
              handleRestore={deletion.handleRestore}
              handlePurge={deletion.handlePurge}
              pendingStoreId={pendingStoreId}
              router={router}
            />
            )}
          </div>

          {storeMeta && (
            <StorePagination
              meta={storeMeta}
              onPageChange={handlePageChange}
            />
          )}
        </CardContent>
      </Card>

      <SuspendStoreDialog
        isOpen={isSuspendDialogOpen}
        onOpenChange={setIsSuspendDialogOpen}
        selectedStore={selectedStore}
        handleSuspend={handleSuspend}
        isPending={suspendMutation.isPending}
      />

      <SharedGrantTrialDialog
        open={isTrialDialogOpen}
        onOpenChange={setIsTrialDialogOpen}
        targetName={selectedStore?.name}
        onConfirm={handleGrantTrial}
        isPending={grantTrialMutation.isPending}
      />

      <SharedActivatePlanDialog
        open={isActivatePlanDialogOpen}
        onOpenChange={setIsActivatePlanDialogOpen}
        targetName={selectedStore?.name}
        onConfirm={handleActivatePlan}
        isPending={activatePlanMutation.isPending}
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
        isOpen={isBillingDialogOpen}
        onOpenChange={setIsBillingDialogOpen}
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
    </div>
  );
}
