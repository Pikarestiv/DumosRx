"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Download,
  ShieldAlert,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminStores } from "@/lib/api/admin-hooks";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { StoreTable } from "@/components/admin/stores/store-table";
import { StoreToolbar } from "@/components/admin/stores/store-toolbar";
import { StorePagination } from "@/components/admin/stores/store-pagination";
import { StoreDialogHost } from "@/components/admin/stores/store-dialog-host";
import { FleetStockValueCard } from "@/components/admin/stores/fleet-stock-value-card";
import { useAdminAuthStore, checkHasPermission } from "@/lib/store/use-admin-auth-store";
import { useStoreActions } from "@/hooks/use-store-actions";
import type { AdminStoresArchivedScope } from "@/lib/api/admin-hooks-stores";
import { downloadStoreFleetCsv } from "@/lib/admin-store-export";
import { toast } from "sonner";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";

const SEARCH_DEBOUNCE_MS = 300;

export default function StoresManagement() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAdminAuthStore();
  // Hidden, not disabled, when the caller lacks it (web/AGENTS.md).
  const canRegisterStore = checkHasPermission(user as never, "create_accounts");
  const initialSearch = searchParams.get("search") || "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [archivedScope, setArchivedScope] = useState<AdminStoresArchivedScope>("active");

  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

  const { data: response, isLoading, error, refetch } = useAdminStores(
    page,
    debouncedSearch,
    statusFilter === "all" ? "" : statusFilter,
    planFilter === "all" ? "" : planFilter,
    archivedScope
  );

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

  const actions = useStoreActions(() => void refetch());

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
          {canRegisterStore && (
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20"
              onClick={() => router.push("/admin/stores/new")}
            >
              <Plus className="h-4 w-4 mr-2" />
              Register Store
            </Button>
          )}
        </div>
      </div>

      {response?.stock_value_by_currency && (
        <FleetStockValueCard totals={response.stock_value_by_currency} />
      )}

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
              {...actions.handlers}
              pendingStoreId={actions.pendingStoreId}
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

      <StoreDialogHost {...actions.dialogHost} />
    </div>
  );
}
