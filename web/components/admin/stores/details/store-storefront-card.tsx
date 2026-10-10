"use client";

import { toast } from "sonner";
import { Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { DetailCard, Field } from "./store-detail-primitives";
import { useSetStoreStorefrontMutation } from "@/lib/api/admin-hooks";
import { useAdminAuthStore, checkHasPermission } from "@/lib/store/use-admin-auth-store";
import type { AdminStoreDetail } from "@/lib/types/admin";

export function StoreStorefrontCard({ store }: { store: AdminStoreDetail }) {
  const { user } = useAdminAuthStore();
  const setStorefront = useSetStoreStorefrontMutation();
  const enabled = store.storefront.online_store_enabled;

  return (
    <DetailCard title="Online Storefront" icon={<Globe className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Storefront"
          value={
            checkHasPermission(user, "manage_account_status") ? (
              <span className="inline-flex items-center gap-2">
                <Switch
                  checked={enabled}
                  disabled={setStorefront.isPending}
                  aria-label={enabled ? "Unpublish storefront" : "Publish storefront"}
                  onCheckedChange={(next) =>
                    setStorefront.mutate(
                      { id: store.id, enabled: next },
                      {
                        onSuccess: () =>
                          toast.success(next ? "Storefront published" : "Storefront unpublished"),
                        onError: (error) =>
                          toast.error(
                            error instanceof Error && error.message
                              ? error.message
                              : "Could not change the storefront",
                          ),
                      },
                    )
                  }
                />
                {enabled ? "Published" : "Disabled"}
              </span>
            ) : (
              enabled ? "Published" : "Disabled"
            )
          }
        />
        <Field label="Slug" value={store.storefront.store_slug} mono />
        <Field
          label="Pending Rebuild"
          value={
            store.storefront.pending_rebuild
              ? `Yes · changed ${store.storefront.dirty_since ?? "recently"}`
              : "No"
          }
        />
      </div>
      {store.storefront.pending_rebuild ? (
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
          The published page is stale until the next full site rebuild.
        </p>
      ) : null}
    </DetailCard>
  );
}
