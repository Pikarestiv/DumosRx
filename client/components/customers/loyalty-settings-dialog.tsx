"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Loader2, Tag, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import {
  getLoyaltyTiers,
  getLoyaltyRedemptionOptions,
  ensureLoyaltyDefaultsSeeded,
  LoyaltyTierRow,
  LoyaltyRedemptionOptionRow,
} from "@/lib/db/queries/loyalty";
import {
  useDeleteLoyaltyTierMutation,
  useDeleteLoyaltyRedemptionOptionMutation,
} from "@/lib/hooks/use-loyalty-mutations";
import { queryClient } from "@/lib/query-client";
import { REDEMPTION_ICONS, REDEMPTION_ICON_BG } from "./loyalty-icons";
import { LoyaltySettingsRow } from "./loyalty-settings-row";
import { LoyaltyTierFormDialog } from "./loyalty-tier-form-dialog";
import { LoyaltyRedemptionFormDialog } from "./loyalty-redemption-form-dialog";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoyaltySettingsDialog({ open, onOpenChange }: Props) {
  const { user, canManageStockBatch } = useAuth();
  const { storeProfile, updateStoreProfile } = useStore();
  const { canAccessLoyaltyProgramPlan, getUpgradeMessage } = useFeatureGate();
  const [section, setSection] = useState<"tiers" | "redemption">("tiers");

  // Same field, same mutation mechanism as the Business Info tab's "Enable
  // Loyalty Program" switch — both write stores.loyalty_program_enabled via
  // updateStoreProfile() (a direct `update("stores", storeId, {...})` under
  // the hood), so the two toggles can never drift onto separate paths.
  const loyaltyProgramEnabled = storeProfile?.loyalty_program_enabled !== 0;
  const handleToggleLoyaltyProgram = (val: boolean) => {
    if (!canAccessLoyaltyProgramPlan) {
      toast.error(getUpgradeMessage('loyalty_program', "Upgrade to a premium plan to use the Loyalty Program."));
      return;
    }
    updateStoreProfile({ loyalty_program_enabled: val ? 1 : 0 });
  };

  // Defense-in-depth: the only current entry point (LoyaltyTab's "Edit
  // Settings" button) is already gated, but this closes the dialog if it's
  // ever reached another way by a role that can't manage stock/config.
  useEffect(() => {
    if (open && !canManageStockBatch) onOpenChange(false);
  }, [open, canManageStockBatch, onOpenChange]);

  const [tierFormOpen, setTierFormOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<LoyaltyTierRow | null>(null);
  const [tierToDelete, setTierToDelete] = useState<string | null>(null);

  const [optionFormOpen, setOptionFormOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<LoyaltyRedemptionOptionRow | null>(null);
  const [optionToDelete, setOptionToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    ensureLoyaltyDefaultsSeeded(user?.id).then(() => {
      queryClient.invalidateQueries(queryKeys.loyalty.tiers());
      queryClient.invalidateQueries(queryKeys.loyalty.redemptionOptions());
    });
  }, [open, user?.id]);

  const { data: tiersData, isLoading: loadingTiers, refetch: refetchTiers } = useQuery({
    ...queryKeys.loyalty.tiers(),
    queryFn: getLoyaltyTiers,
    enabled: open,
  });
  const tiers = tiersData || [];

  const { data: optionsData, isLoading: loadingOptions, refetch: refetchOptions } = useQuery({
    ...queryKeys.loyalty.redemptionOptions(),
    queryFn: getLoyaltyRedemptionOptions,
    enabled: open,
  });
  const options = optionsData || [];

  const openTierForm = (tier: LoyaltyTierRow | null = null) => {
    setEditingTier(tier);
    setTierFormOpen(true);
  };

  const deleteTierMutation = useDeleteLoyaltyTierMutation();
  const deleteTier = async () => {
    if (!tierToDelete) return;
    try {
      await deleteTierMutation.mutateAsync(tierToDelete);
      refetchTiers();
    } finally {
      setTierToDelete(null);
    }
  };

  const openOptionForm = (option: LoyaltyRedemptionOptionRow | null = null) => {
    setEditingOption(option);
    setOptionFormOpen(true);
  };

  const deleteOptionMutation = useDeleteLoyaltyRedemptionOptionMutation();
  const deleteOption = async () => {
    if (!optionToDelete) return;
    try {
      await deleteOptionMutation.mutateAsync(optionToDelete);
      refetchOptions();
    } finally {
      setOptionToDelete(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Loyalty Program Settings</DialogTitle>
            <DialogDescription>
              Manage tier thresholds, benefits, and points redemption rewards.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label className="text-base">Program Status</Label>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>When off, points stop earning and the Redeem Reward option disappears from POS checkout. Tiers and rewards below stay configured for whenever you turn it back on.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-sm text-muted-foreground">
                Let customers earn and redeem points on purchases
              </p>
            </div>
            <Switch
              id="loyalty-program-enabled-dialog"
              checked={loyaltyProgramEnabled}
              onCheckedChange={handleToggleLoyaltyProgram}
            />
          </div>

          <div className="flex gap-2 border-b pb-2">
            <button
              onClick={() => setSection("tiers")}
              className={`text-[13px] font-medium px-3 py-1.5 rounded-[8px] ${section === "tiers" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/10"}`}
            >
              Tiers
            </button>
            <button
              onClick={() => setSection("redemption")}
              className={`text-[13px] font-medium px-3 py-1.5 rounded-[8px] ${section === "redemption" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/10"}`}
            >
              Redemption Options
            </button>
          </div>

          {section === "tiers" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => openTierForm()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tier
                </Button>
              </div>
              {loadingTiers && (
                <div className="flex justify-center p-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loadingTiers && tiers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No tiers configured.</p>
              )}
              <div className="space-y-2">
                {tiers.map((tier) => (
                  <LoyaltySettingsRow
                    key={tier.id}
                    leading={<div className={`w-2.5 h-2.5 rounded-full ${tier.color}`} />}
                    title={tier.name}
                    subtitle={`Min spend ${Number(tier.min_spend).toLocaleString()} • ${tier.points_multiplier}x points`}
                    onEdit={() => openTierForm(tier)}
                    onDelete={() => setTierToDelete(tier.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {section === "redemption" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => openOptionForm()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Reward
                </Button>
              </div>
              {loadingOptions && (
                <div className="flex justify-center p-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loadingOptions && options.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No redemption options configured.</p>
              )}
              <div className="space-y-2">
                {options.map((option) => {
                  const Icon = REDEMPTION_ICONS[option.icon_key] || Tag;
                  return (
                    <LoyaltySettingsRow
                      key={option.id}
                      leading={
                        <div className={`w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 ${REDEMPTION_ICON_BG[option.icon_key] || REDEMPTION_ICON_BG.tag}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                      }
                      title={
                        <span className="flex items-center gap-2">
                          {option.label}
                          {!option.is_active && (
                            <span className="text-[10px] text-muted-foreground border rounded px-1">inactive</span>
                          )}
                        </span>
                      }
                      subtitle={`${Number(option.points_cost).toLocaleString()} points`}
                      onEdit={() => openOptionForm(option)}
                      onDelete={() => setOptionToDelete(option.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LoyaltyTierFormDialog
        open={tierFormOpen}
        onOpenChange={setTierFormOpen}
        tier={editingTier}
        userId={user?.id}
        nextSortOrder={tiers.length}
        onSaved={refetchTiers}
      />

      <LoyaltyRedemptionFormDialog
        open={optionFormOpen}
        onOpenChange={setOptionFormOpen}
        option={editingOption}
        userId={user?.id}
        nextSortOrder={options.length}
        onSaved={refetchOptions}
      />

      <ConfirmDialog
        open={!!tierToDelete}
        onOpenChange={(o) => !o && setTierToDelete(null)}
        title="Delete Tier?"
        description="This will remove the tier from loyalty settings. Customers currently in this tier will fall back to the next matching tier."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={deleteTier}
      />

      <ConfirmDialog
        open={!!optionToDelete}
        onOpenChange={(o) => !o && setOptionToDelete(null)}
        title="Delete Reward?"
        description="This will remove the redemption option from the loyalty program."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={deleteOption}
      />
    </>
  );
}
