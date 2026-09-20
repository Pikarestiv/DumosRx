"use client";

import { useState } from "react";
import {
  Download,
  ShieldAlert,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminStores, useSuspendStoreMutation, useUnsuspendStoreMutation, useImpersonateStoreMutation, useGrantTrialMutation, useActivatePlanMutation, useMarkStoreDemoMutation, useUnmarkStoreDemoMutation } from "@/lib/api/admin-hooks";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { StoreTable } from "@/components/admin/stores/store-table";
import { StoreToolbar } from "@/components/admin/stores/store-toolbar";
import { StorePagination } from "@/components/admin/stores/store-pagination";
import { SuspendStoreDialog, ViewStoreDialog, BillingHistoryDialog } from "@/components/admin/stores/store-dialogs";
import { SharedGrantTrialDialog } from "@/components/admin/shared-grant-trial-dialog";
import { SharedActivatePlanDialog } from "@/components/admin/shared-activate-plan-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { escapeCsvCell } from "@/lib/utils";
import { toast } from "sonner";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import type { AdminStoreSummary } from "@/lib/types/admin";
import { webApiClient } from "@/lib/api/client";
import { getAppURL, APP_URL } from "@/lib/constants";
import { getBaseURL } from "@/lib/api/base-client";
import { getCurrentEnvironmentName } from "@/components/ui/server-selector";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";

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
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isBillingDialogOpen, setIsBillingDialogOpen] = useState(false);
  const [impersonateTarget, setImpersonateTarget] = useState<AdminStoreSummary | null>(null);

  const debouncedSearch = useDebounce(search, 500);

  const { data: response, isLoading, error, refetch } = useAdminStores(
    page,
    debouncedSearch,
    statusFilter === "all" ? "" : statusFilter,
    planFilter === "all" ? "" : planFilter
  );
  const suspendMutation = useSuspendStoreMutation();
  const unsuspendMutation = useUnsuspendStoreMutation();
  const impersonateMutation = useImpersonateStoreMutation();
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

  const storeList = response?.data || [];
  const storeMeta = response?.meta;

  // Which row (if any) has an unsuspend/demo mutation in flight. TanStack
  // exposes the in-flight mutation's own `variables` (the store id here),
  // so no extra state is needed to identify the busy row.
  const pendingStoreId =
    (unsuspendMutation.isPending ? unsuspendMutation.variables : undefined) ??
    (markDemoMutation.isPending ? markDemoMutation.variables : undefined) ??
    (unmarkDemoMutation.isPending ? unmarkDemoMutation.variables : undefined) ??
    null;

  const handleExportCSV = () => {
    if (storeList.length === 0) return;

    const csv = [
      ["ID", "Name", "Owner", "Email", "Plan", "Status", "Date"],
      ...storeList.map((p: AdminStoreSummary) => [
        p.id,
        p.name,
        p.owner,
        p.email,
        p.plan,
        p.status,
        p.date,
      ]),
    ]
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stores-export-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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

  // Row menu only opens the confirmation; the real work happens once the
  // admin confirms which store/owner they're about to become.
  const handleImpersonate = (store: AdminStoreSummary) => {
    setImpersonateTarget(store);
  };

  const startImpersonation = (store: AdminStoreSummary) => {
    // Guard against the case that actually bit us: a dev/staging admin
    // session (talking to a non-production API) whose "App URL" override
    // was never set, so getAppURL() silently falls back to the hardcoded
    // production app.dumosrx.com — sending a real handoff code to
    // production from a session the admin believes is fully sandboxed.
    // Only fires on that specific mismatch; a genuine production admin
    // session (prod API + prod app URL) is unaffected.
    const apiEnv = getCurrentEnvironmentName(getBaseURL());
    const appUrl = getAppURL();
    const appUrlIsUnoverriddenProduction = appUrl === APP_URL;
    if (apiEnv !== "Production Server" && appUrlIsUnoverriddenProduction) {
      const proceed = window.confirm(
        `You're on ${apiEnv}, but the impersonation "App URL" is still set ` +
          `to production (${appUrl}). Continuing will send a real handoff ` +
          `code there. Set the App URL under "Server Config" first unless ` +
          `you mean to do this. Continue anyway?`,
      );
      if (!proceed) return;
    }

    impersonateMutation.mutate(store.id, {
      onSuccess: (data) => {
        void (async () => {
          try {
            const adminToken = useAdminAuthStore.getState().token;
            if (!adminToken) {
              toast.error("Impersonation Failed", {
                description: "No active admin session to hand back to.",
              });
              return;
            }

            // Minted one at a time, not via Promise.all: if the second mint
            // fails we still hold the first code and can burn it. Consuming
            // it is the only invalidation AuthHandoffController exposes
            // (`consume` is an atomic Cache::pull get-and-delete), so we
            // redeem-and-discard it rather than leave a live code sitting in
            // the cache for the rest of its 60s TTL.
            const { code: userCode } = await webApiClient.createHandoffCode(data.token);

            let returnCode: string;
            try {
              ({ code: returnCode } = await webApiClient.createHandoffCode(adminToken));
            } catch (mintErr) {
              let burned = false;
              try {
                await webApiClient.consumeHandoffCode(userCode);
                burned = true;
              } catch (burnErr) {
                console.error(
                  "[impersonation] return-code mint failed and the user handoff code could not be burned; it stays redeemable for up to 60s",
                  { mintErr, burnErr },
                );
              }
              toast.error("Impersonation Failed", {
                description: burned
                  ? "Could not create the return session. The handoff code was invalidated; nothing was exposed."
                  : "Could not create the return session, and the handoff code could not be invalidated - it may stay usable for up to 60 seconds.",
              });
              return;
            }

            toast.success("Impersonation Successful", {
              description: `Logged in as ${data.user.name}. Redirecting...`,
            });

            // Codes travel in the URL fragment, never the query string: a
            // fragment is not sent to the destination server and never
            // appears in its access logs or in a Referer header, so the
            // return_code (which wraps this super_admin's own live token)
            // stays client-side only.
            window.location.href = `${getAppURL()}/auth/callback#code=${encodeURIComponent(userCode)}&return_code=${encodeURIComponent(returnCode)}`;
          } catch (_err) {
            toast.error("Impersonation Failed", {
              description: "Could not hand off session to the app.",
            });
          }
        })();
      },
      onError: (err) => {
        toast.error("Impersonation Failed", {
          description: err.message || "Failed to start impersonation session.",
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
            onClick={handleExportCSV}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
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
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={(val) => { setStatusFilter(val); setPage(1); }}
            planFilter={planFilter}
            onPlanFilterChange={(val) => { setPlanFilter(val); setPage(1); }}
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
              handleImpersonate={handleImpersonate}
              handleViewBilling={handleViewBilling}
              setSelectedStore={setSelectedStore}
              setIsSuspendDialogOpen={setIsSuspendDialogOpen}
              setIsTrialDialogOpen={setIsTrialDialogOpen}
              setIsActivatePlanDialogOpen={setIsActivatePlanDialogOpen}
              setIsViewDialogOpen={setIsViewDialogOpen}
              handleUnsuspend={handleUnsuspend}
              handleToggleDemo={handleToggleDemo}
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

      <ViewStoreDialog
        isOpen={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        selectedStore={selectedStore}
      />

      <BillingHistoryDialog
        isOpen={isBillingDialogOpen}
        onOpenChange={setIsBillingDialogOpen}
        selectedStore={selectedStore}
      />

      <ConfirmDialog
        open={impersonateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setImpersonateTarget(null);
        }}
        title="Start impersonation session?"
        description={
          impersonateTarget
            ? `You will be signed into the app as ${impersonateTarget.owner} (${impersonateTarget.email}), the owner of ${impersonateTarget.name}. Every action you take will be recorded against that account until you return to the admin panel.`
            : ""
        }
        confirmLabel="Impersonate"
        onConfirm={() => {
          if (impersonateTarget) startImpersonation(impersonateTarget);
        }}
      />
    </div>
  );
}
