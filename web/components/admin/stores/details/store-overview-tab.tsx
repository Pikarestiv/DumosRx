"use client";

import { Users } from "lucide-react";
import type { AdminStoreDetail } from "@/lib/types/admin";
import { StoreStaffList } from "@/components/admin/stores/store-staff-list";
import { AccountManagerCard } from "@/components/admin/stores/details/account-manager-card";
import { DetailCard } from "@/components/admin/stores/details/store-detail-primitives";
import {
  StoreOwnerCard,
  StorePaymentsCard,
  StoreProfileCard,
  StoreSubscriptionCard,
} from "@/components/admin/stores/details/store-detail-sections";
import { StoreStorefrontCard } from "@/components/admin/stores/details/store-storefront-card";
import {
  StoreBusinessMetricsCard,
  StoreOperationalMetricsCard,
} from "@/components/admin/stores/details/store-metrics-cards";

export function StoreOverviewTab({ store }: { store: AdminStoreDetail }) {
  return (
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
      <StoreStorefrontCard store={store} />
      <StorePaymentsCard store={store} />
    </div>
  );
}
