"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "./store-detail-primitives";
import { useSetStoreStorefrontMutation } from "@/lib/api/admin-hooks";
import { formatDateSafe } from "@/lib/utils/date-utils";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";

const BY_LABEL = new Map([
  ["owner", "By the owner"],
  ["admin", "By an admin"],
  ["plan_change", "Kept from an earlier plan"],
]);

export function StorefrontOptInStatus({ store, canManage }: { store: AdminStoreDetail; canManage: boolean }) {
  const setStorefront = useSetStoreStorefrontMutation();
  const { opt_in_required: required, opted_in_at: at, opted_in_by: by, storefront_live: live, online_store_enabled: enabled } = store.storefront;

  if (!required) return null;

  const putLive = () =>
    setStorefront.mutate(
      { id: store.id, enabled: true },
      {
        onSuccess: () => toast.success("Storefront is live"),
        onError: (error) => toast.error(error instanceof Error && error.message ? error.message : "Could not put the storefront live"),
      },
    );

  const value = at
    ? `${BY_LABEL.get(by ?? "") ?? "Opted in"} on ${formatDateSafe(at, "dd/MM/yyyy HH:mm")}`
    : live
      ? "Kept from an earlier plan"
      : (
          <span className="flex flex-col gap-2 font-normal">
            <span>
              Not live yet: a Starter storefront waits for the owner to turn it on in the till, or for an admin to switch it on here.
            </span>
            {canManage && enabled ? (
              <Button size="sm" variant="outline" className="w-fit" onClick={putLive} disabled={setStorefront.isPending}>
                Put it live for the owner
              </Button>
            ) : null}
          </span>
        );

  return <Field label="Starter opt-in" value={value} />;
}
