"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Store, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useStore } from "@/lib/context/store-context";
import { apiClient } from "@/lib/api/client";
import type { FleetStore } from "@/lib/types/store";
import { FleetList } from "./fleet-list";
import { FleetFormDialog } from "./fleet-form-dialog";
import { FleetDeleteDialog } from "./fleet-delete-dialog";

export function MultiStoreCard() {
  const { canManageMultiStore, getUpgradeMessage } = useFeatureGate();
  const { activeStoreId, storeProfile, updateStoreProfile } = useStore();
  const queryClient = useQueryClient();
  const [stores, setStores] = useState<FleetStore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [storeToEdit, setStoreToEdit] = useState<FleetStore | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const loadStores = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getStores();
      setStores(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load stores",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Fleet writes go straight to the cloud API and never touch local SQLite,
  // so React Query's own store caches never learn a write happened. This
  // won't surface the change before the next sync pull lands (Fleet stays
  // cloud-only), but it ensures mounted components re-fetch fresh local
  // data as soon as that pull does complete, instead of serving a cache
  // that never refreshes.
  const invalidateStoreCaches = () => {
    void queryClient.invalidateQueries({ queryKey: ["allStores"] });
    void queryClient.invalidateQueries({ queryKey: ["storeProfile"] });
  };

  const handleMutationSuccess = () => {
    void loadStores();
    invalidateStoreCaches();
  };

  useEffect(() => {
    if (canManageMultiStore) {
      void loadStores();
    }
  }, [canManageMultiStore]);

  if (!canManageMultiStore) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Multiple Stores</CardTitle>
          <CardDescription>
            Run more than one location under the same account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-primary/10 shrink-0">
                <Store className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Multi-store locked</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  {getUpgradeMessage(
                    "multi_store",
                    "Running multiple stores is available on higher plans.",
                  )}
                </p>
              </div>
            </div>
            <Button variant="default" className="shrink-0" asChild>
              <Link href="/settings/billing">
                <Lock className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Multiple Stores</CardTitle>
          <CardDescription>
            Manage every store location on this account.
          </CardDescription>
        </div>
        <Button
          onClick={() => {
            setStoreToEdit(null);
            setIsFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Store
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <FleetList
          stores={stores}
          isLoading={isLoading}
          activeStoreId={activeStoreId}
          onEdit={(store) => {
            setStoreToEdit(store);
            setIsFormOpen(true);
          }}
          onDelete={(id, name) => setDeleteTarget({ id, name })}
          onAddStore={() => {
            setStoreToEdit(null);
            setIsFormOpen(true);
          }}
        />

        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="staff-can-request-transfers" className="text-sm font-medium">
              Allow staff to request stock transfers
            </Label>
            <p className="text-xs text-muted-foreground max-w-sm">
              When on, cashiers and specialists can request stock from
              another store from the POS screen, not just admins/owners.
              The transfer still moves stock immediately - staff-initiated
              ones are just flagged for review afterward.
            </p>
          </div>
          <Switch
            id="staff-can-request-transfers"
            checked={storeProfile?.staff_can_request_transfers === 1}
            onCheckedChange={(checked) => {
              void updateStoreProfile({
                staff_can_request_transfers: checked ? 1 : 0,
              });
            }}
          />
        </div>
      </CardContent>

      <FleetFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        storeToEdit={storeToEdit}
        activeStoreId={activeStoreId}
        onSuccess={handleMutationSuccess}
      />
      <FleetDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onSuccess={handleMutationSuccess}
      />
    </Card>
  );
}
