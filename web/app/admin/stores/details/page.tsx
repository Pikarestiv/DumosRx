"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Box,
  History,
  PackageSearch,
  ShieldAlert,
  ShoppingCart,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { StoreStaffList } from "@/components/admin/stores/store-staff-list";
import { AccountManagerCard } from "@/components/admin/stores/details/account-manager-card";
import {
  DetailCard,
  StatTile,
} from "@/components/admin/stores/details/store-detail-primitives";
import {
  StoreOwnerCard,
  StorePaymentsCard,
  StoreProfileCard,
  StoreRecentActivityCard,
  StoreRecentTransactionsCard,
  StoreStorefrontCard,
  StoreSubscriptionCard,
  StoreSyncCard,
} from "@/components/admin/stores/details/store-detail-sections";
import { StoreSyncHealthPanel } from "@/components/admin/stores/details/store-sync-health-section";
import {
  StoreBusinessMetricsCard,
  StoreOperationalMetricsCard,
} from "@/components/admin/stores/details/store-metrics-cards";
import { useAdminStoreDetail } from "@/lib/api/admin-hooks";

function StoreDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams?.get("id") ?? null;

  const { data: store, isLoading, isError, error, refetch } = useAdminStoreDetail(storeId);

  if (!storeId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <ShieldAlert className="h-10 w-10 text-rose-500" />
        <p className="font-bold text-rose-500">No store was selected.</p>
        <Button variant="outline" onClick={() => router.push("/admin/stores/")}>
          Back to Store Fleet
        </Button>
      </div>
    );
  }

  if (isLoading || !store) {
    if (isError) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <ShieldAlert className="h-10 w-10 text-rose-500" />
          <p className="font-bold text-rose-500">
            {error instanceof Error ? error.message : "Failed to load this store."}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      );
    }
    return <AdminSkeleton />;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-4">
        <Button
          variant="ghost"
          className="font-bold -ml-3 text-slate-500"
          onClick={() => router.push("/admin/stores/")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Store Fleet
        </Button>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {store.name}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Owned by {store.owner?.name ?? "—"} · Registered {store.created_at}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className={
                store.status === "Suspended"
                  ? "bg-rose-500 hover:bg-rose-600"
                  : "bg-emerald-500 hover:bg-emerald-600"
              }
            >
              {store.status}
            </Badge>
            {store.is_demo ? (
              <Badge className="bg-amber-500 hover:bg-amber-600">Demo</Badge>
            ) : null}
            {store.is_archived ? (
              <Badge className="bg-slate-500 hover:bg-slate-600">
                Archived {store.archived_at ?? ""}
              </Badge>
            ) : null}
            {store.subscription ? (
              <Badge variant="outline" className="font-black capitalize border-2">
                {store.subscription.plan}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {store.revenue && (
          <StatTile label="Lifetime Revenue" value={store.revenue} icon={<Banknote className="h-5 w-5" />} />
        )}
        <StatTile label="Staff" value={store.counts.staff} icon={<Users className="h-5 w-5" />} />
        <StatTile label="Products" value={store.counts.products} icon={<Box className="h-5 w-5" />} />
        <StatTile label="Customers" value={store.counts.customers} icon={<Users className="h-5 w-5" />} />
        <StatTile label="Sales" value={store.counts.sales} icon={<ShoppingCart className="h-5 w-5" />} />
        <StatTile
          label="Total Stock Value"
          value={store.counts.stock_value}
          icon={<PackageSearch className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StoreBusinessMetricsCard store={store} />
        <StoreOperationalMetricsCard store={store} />
        <StoreProfileCard store={store} />
        <div className="space-y-6">
          <StoreOwnerCard store={store} />
          <StoreSubscriptionCard store={store} />
        </div>
        <DetailCard title="Store Staff" icon={<Users className="h-4 w-4" />}>
          <StoreStaffList storeId={store.id} />
        </DetailCard>
        <AccountManagerCard store={store} />
        <StoreSyncCard store={store} />
        <StoreSyncHealthPanel storeId={store.id} />
        <StoreStorefrontCard store={store} />
        <StorePaymentsCard store={store} />
        <StoreRecentTransactionsCard store={store} />
        <StoreRecentActivityCard store={store} />
        <DetailCard title="Full Activity Log" icon={<History className="h-4 w-4" />}>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Recent entries are listed above. The complete, filterable log lives on the Activity
            page.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl font-bold"
            onClick={() =>
              router.push(
                `/admin/activity?store_id=${encodeURIComponent(store.id)}&store_name=${encodeURIComponent(store.name)}`,
              )
            }
          >
            Open Activity Log
          </Button>
        </DetailCard>
      </div>
    </div>
  );
}

export default function StoreDetailsPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <StoreDetailsContent />
    </Suspense>
  );
}
