"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Box,
  PackageSearch,
  ShieldAlert,
  ShoppingCart,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { StoreDetailActions } from "@/components/admin/stores/details/store-detail-actions";
import { StatTile } from "@/components/admin/stores/details/store-detail-primitives";
import { StoreDetailTabs } from "@/components/admin/stores/details/store-detail-tabs";
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
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white break-words">
              {store.name}
            </h1>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Owned by {store.owner?.name ?? "—"} · Registered {store.created_at}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StoreDetailActions store={store} onChanged={() => void refetch()} />
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

      <StoreDetailTabs store={store} />
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
