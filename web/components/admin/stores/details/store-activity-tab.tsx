"use client";

import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import type { AdminStoreDetail } from "@/lib/types/admin";
import { Button } from "@/components/ui/button";
import { adminStoreActivityPath } from "@/lib/admin-routes";
import {
  StoreRecentActivityCard,
  StoreRecentTransactionsCard,
} from "@/components/admin/stores/details/store-detail-sections";

export function StoreActivityTab({ store }: { store: AdminStoreDetail }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl font-bold"
          onClick={() => router.push(adminStoreActivityPath(store.id, store.name))}
        >
          <History className="h-4 w-4 mr-2" />
          Open Activity Log
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StoreRecentTransactionsCard store={store} />
        <StoreRecentActivityCard store={store} />
      </div>
    </div>
  );
}
