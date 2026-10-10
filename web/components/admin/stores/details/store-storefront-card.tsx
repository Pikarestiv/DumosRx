"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailCard, Field } from "./store-detail-primitives";
import { useSetStoreStorefrontMutation } from "@/lib/api/admin-hooks";
import { useAdminAuthStore, checkHasPermission } from "@/lib/store/use-admin-auth-store";
import type { AdminStoreDetail } from "@/lib/types/admin";

const SLUG_INPUT_ID = "storefront-slug";

export function StoreStorefrontCard({ store }: { store: AdminStoreDetail }) {
  const { user } = useAdminAuthStore();
  const setStorefront = useSetStoreStorefrontMutation();
  const canManage = checkHasPermission(user, "manage_account_status");
  const enabled = store.storefront.online_store_enabled;
  const slug = store.storefront.store_slug;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);

  const submit = (storeSlug: string) =>
    setStorefront.mutate(
      { id: store.id, enabled, storeSlug },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success("Storefront address saved");
        },
        onError: (error) =>
          toast.error(
            error instanceof Error && error.message
              ? error.message
              : "Could not save the storefront address",
          ),
      },
    );

  const saveDraft = () => {
    const next = draft.trim();
    if (!next || next === slug) return;
    if (slug) {
      setConfirmReplace(true);
      return;
    }
    submit(next);
  };

  const startEditing = () => {
    setDraft(slug ?? "");
    setEditing(true);
  };

  return (
    <DetailCard title="Online Storefront" icon={<Globe className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Storefront"
          value={
            canManage ? (
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
        <Field
          label="Slug"
          mono={!editing}
          value={
            editing ? (
              <span className="flex flex-col gap-2">
                <label htmlFor={SLUG_INPUT_ID} className="sr-only">
                  Storefront address
                </label>
                <Input
                  id={SLUG_INPUT_ID}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="corner-pharmacy"
                  className="font-mono text-xs"
                />
                <span className="flex gap-2">
                  <Button size="sm" onClick={saveDraft} disabled={setStorefront.isPending}>
                    Save address
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                {slug ?? "—"}
                {canManage ? (
                  <Button size="sm" variant="outline" onClick={startEditing}>
                    {slug ? "Change address" : "Set address"}
                  </Button>
                ) : null}
              </span>
            )
          }
        />
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
      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title="Change the storefront address?"
        description={`Customers reach this store at /store/${slug}. That link will stop working as soon as the address changes, including anywhere the owner has shared or printed it. A store's address can only be changed once every 6 months.`}
        confirmLabel="Change the address"
        onConfirm={() => submit(draft.trim())}
      />
    </DetailCard>
  );
}
