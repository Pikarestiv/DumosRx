"use client";

import { Boxes, History, Table2 } from "lucide-react";
import type { AdminStoreDetail } from "@/lib/types/admin";
import { DetailCard } from "@/components/admin/stores/details/store-detail-primitives";
import { StoreSyncCard } from "@/components/admin/stores/details/store-detail-sections";
import { StoreSyncHealthPanel } from "@/components/admin/stores/details/store-sync-health-section";
import { StoreStockDivergencePanel } from "@/components/admin/stores/details/store-stock-divergence-section";
import { StoreQueueStatePanel } from "@/components/admin/stores/details/store-queue-state-section";
import { StoreTableAgreementPanel } from "@/components/admin/stores/details/store-table-agreement-section";
import { useAdminAuthStore, checkHasPermission } from "@/lib/store/use-admin-auth-store";

export function StoreSyncTab({ store }: { store: AdminStoreDetail }) {
  const { user } = useAdminAuthStore();

  // A-290/A-135: every panel below is server-gated on view_platform_health,
  // so carry the check here too rather than trusting whoever renders this.
  if (!checkHasPermission(user as never, "view_platform_health")) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <DetailCard title="Device Table Agreement" icon={<Table2 className="h-4 w-4" />}>
        <StoreTableAgreementPanel storeId={store.id} />
      </DetailCard>
      <DetailCard title="Device Stock Agreement" icon={<Boxes className="h-4 w-4" />}>
        <StoreStockDivergencePanel storeId={store.id} currency={store.currency} />
      </DetailCard>
      <DetailCard title="Stuck On Devices" icon={<History className="h-4 w-4" />}>
        <StoreQueueStatePanel storeId={store.id} />
      </DetailCard>
      <StoreSyncHealthPanel storeId={store.id} />
      <StoreSyncCard store={store} />
    </div>
  );
}
