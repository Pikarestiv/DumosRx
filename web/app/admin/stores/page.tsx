"use client";

import { useEffect, useState } from "react";
import {
  Download,
  ShieldAlert,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminStores, useSuspendStoreMutation, useUnsuspendStoreMutation, useImpersonateStoreMutation, useGrantTrialMutation, useMarkStoreDemoMutation, useUnmarkStoreDemoMutation } from "@/lib/api/admin-hooks";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { StoreTable } from "@/components/admin/stores/store-table";
import { StoreToolbar } from "@/components/admin/stores/store-toolbar";
import { StorePagination } from "@/components/admin/stores/store-pagination";
import { SuspendStoreDialog, ViewStoreDialog } from "@/components/admin/stores/store-dialogs";
import { SharedGrantTrialDialog } from "@/components/admin/shared-grant-trial-dialog";
import { toast } from "sonner";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import type { AdminStoreSummary } from "@/lib/types/admin";
import { webApiClient } from "@/lib/api/client";
import { getAppURL } from "@/lib/constants";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";

export default function StoresManagement() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialSearch = searchParams.get("search") || "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [selectedStore, setSelectedStore] = useState<AdminStoreSummary | null>(null);
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
  const [isTrialDialogOpen, setIsTrialDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  
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
  const markDemoMutation = useMarkStoreDemoMutation();
  const unmarkDemoMutation = useUnmarkStoreDemoMutation();

  useEffect(() => {
    if (initialSearch && initialSearch !== search) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (response?.meta?.last_page || 1)) {
      setPage(newPage);
    }
  };

  const storeList = response?.data || [];
  const storeMeta = response?.meta;

  const handleExportCSV = () => {
    if (storeList.length === 0) return;

    const headers = ["ID", "Name", "Owner", "Email", "Plan", "Status", "Date"];
    const csvData = storeList.map((p: AdminStoreSummary) =>
      [p.id, p.name, p.owner, p.email, p.plan, p.status, p.date].join(","),
    );

    const blob = new Blob([[headers.join(","), ...csvData].join("\n")], {
      type: "text/csv",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stores-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const handleSuspend = async (reason: string) => {
    if (!selectedStore) return;
    
    suspendMutation.mutate({ id: selectedStore.id, reason }, {
      onSuccess: () => {
        toast.success("Account Suspended", {
          description: `${selectedStore.name} has been suspended successfully.`,
        });
        setIsSuspendDialogOpen(false);
        setSelectedStore(null);
        refetch();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to suspend store.",
        });
      }
    });
  };

  const handleUnsuspend = async (store: AdminStoreSummary) => {
    unsuspendMutation.mutate(store.id, {
      onSuccess: () => {
        toast.success("Account Re-activated", {
          description: `${store.name} has been re-activated successfully.`,
        });
        refetch();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to unsuspend store.",
        });
      }
    });
  };

  const handleGrantTrial = async (plan: string, duration?: string, endDate?: string) => {
    if (!selectedStore) return;

    grantTrialMutation.mutate({ id: selectedStore.id, plan, duration, endDate }, {
      onSuccess: () => {
        const durationLabel = endDate ? `until ${endDate}` : duration;
        toast.success("Trial Granted", {
          description: `Granted ${durationLabel} ${plan} trial to ${selectedStore.name}.`,
        });
        setIsTrialDialogOpen(false);
        setSelectedStore(null);
        refetch();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to grant trial.",
        });
      }
    });
  };

  const handleImpersonate = (store: AdminStoreSummary) => {
    impersonateMutation.mutate(store.id, {
      onSuccess: async (data) => {
        try {
          const adminToken = useAdminAuthStore.getState().token;
          if (!adminToken) {
            toast.error("Impersonation Failed", {
              description: "No active admin session to hand back to.",
            });
            return;
          }

          const [{ code: userCode }, { code: returnCode }] = await Promise.all([
            webApiClient.createHandoffCode(data.token),
            webApiClient.createHandoffCode(adminToken),
          ]);

          toast.success("Impersonation Successful", {
            description: `Logged in as ${data.user.name}. Redirecting...`,
          });

          window.location.href = `${getAppURL()}/auth/callback?code=${userCode}&return_code=${returnCode}`;
        } catch (_err) {
          toast.error("Impersonation Failed", {
            description: "Could not hand off session to the app.",
          });
        }
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
    mutation.mutate(store.id, {
      onSuccess: () => {
        toast.success(store.is_demo ? "Demo Flag Removed" : "Marked as Demo", {
          description: `${store.name} ${store.is_demo ? "is no longer" : "is now"} flagged as a demo account.`,
        });
        refetch();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to update demo flag.",
        });
      }
    });
  };

  const handleViewBilling = (store: AdminStoreSummary) => {
    toast.info("Billing History", {
      description: `Fetching billing records for ${store.name}...`,
    });
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
                  onClick={() => refetch()}
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
              setIsViewDialogOpen={setIsViewDialogOpen}
              handleUnsuspend={handleUnsuspend}
              handleToggleDemo={handleToggleDemo}
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

      <ViewStoreDialog
        isOpen={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        selectedStore={selectedStore}
      />
    </div>
  );
}
