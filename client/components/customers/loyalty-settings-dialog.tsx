"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Loader2, Tag, Truck, Gift, Star, Percent } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/auth-context";
import { insert, update, softDelete } from "@/lib/db/local-database";
import {
  getLoyaltyTiers,
  getLoyaltyRedemptionOptions,
  ensureLoyaltyDefaultsSeeded,
  LoyaltyTierRow,
  LoyaltyRedemptionOptionRow,
} from "@/lib/db/queries/loyalty";
import { queryClient } from "@/lib/query-client";

export const REDEMPTION_ICONS: Record<string, React.ElementType> = {
  tag: Tag,
  truck: Truck,
  gift: Gift,
  star: Star,
  percent: Percent,
};

const TIER_COLORS = [
  { value: "bg-amber-600", label: "Amber" },
  { value: "bg-gray-400", label: "Gray" },
  { value: "bg-yellow-500", label: "Yellow" },
  { value: "bg-purple-600", label: "Purple" },
  { value: "bg-sky-600", label: "Sky" },
  { value: "bg-emerald-600", label: "Emerald" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoyaltySettingsDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [section, setSection] = useState<"tiers" | "redemption">("tiers");

  const [tierFormOpen, setTierFormOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<LoyaltyTierRow | null>(null);
  const [tierForm, setTierForm] = useState({
    name: "",
    min_spend: "0",
    points_multiplier: "1",
    benefits: "",
    color: "bg-amber-600",
  });
  const [tierToDelete, setTierToDelete] = useState<string | null>(null);

  const [optionFormOpen, setOptionFormOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<LoyaltyRedemptionOptionRow | null>(null);
  const [optionForm, setOptionForm] = useState({
    label: "",
    points_cost: "0",
    description: "",
    icon_key: "tag",
    is_active: true,
  });
  const [optionToDelete, setOptionToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      ensureLoyaltyDefaultsSeeded(user?.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ["loyalty_tiers"] });
        queryClient.invalidateQueries({ queryKey: ["loyalty_redemption_options"] });
      });
    }
  }, [open, user?.id]);

  const { data: tiersData, isLoading: loadingTiers, refetch: refetchTiers } = useQuery({
    queryKey: ["loyalty_tiers"],
    queryFn: getLoyaltyTiers,
    enabled: open,
  });
  const tiers = tiersData || [];

  const { data: optionsData, isLoading: loadingOptions, refetch: refetchOptions } = useQuery({
    queryKey: ["loyalty_redemption_options"],
    queryFn: getLoyaltyRedemptionOptions,
    enabled: open,
  });
  const options = optionsData || [];

  const openTierForm = (tier?: LoyaltyTierRow) => {
    if (tier) {
      setEditingTier(tier);
      setTierForm({
        name: tier.name,
        min_spend: String(tier.min_spend),
        points_multiplier: String(tier.points_multiplier),
        benefits: (JSON.parse(tier.benefits || "[]") as string[]).join(", "),
        color: tier.color,
      });
    } else {
      setEditingTier(null);
      setTierForm({ name: "", min_spend: "0", points_multiplier: "1", benefits: "", color: "bg-amber-600" });
    }
    setTierFormOpen(true);
  };

  const saveTier = async () => {
    if (!tierForm.name.trim()) {
      toast.error("Tier name is required");
      return;
    }
    const benefits = JSON.stringify(
      tierForm.benefits.split(",").map((b) => b.trim()).filter(Boolean)
    );
    const payload = {
      user_id: user?.id,
      name: tierForm.name.trim(),
      min_spend: Number(tierForm.min_spend) || 0,
      points_multiplier: Number(tierForm.points_multiplier) || 1,
      benefits,
      color: tierForm.color,
      sort_order: editingTier?.sort_order ?? tiers.length,
    };
    try {
      if (editingTier) {
        await update("loyalty_tiers", editingTier.id, payload);
        toast.success("Tier updated");
      } else {
        await insert("loyalty_tiers", payload);
        toast.success("Tier added");
      }
      setTierFormOpen(false);
      refetchTiers();
    } catch (e) {
      console.error(e);
      toast.error("Failed to save tier");
    }
  };

  const deleteTier = async () => {
    if (!tierToDelete) return;
    try {
      await softDelete("loyalty_tiers", tierToDelete);
      toast.success("Tier removed");
      refetchTiers();
    } catch (e) {
      console.error(e);
      toast.error("Failed to remove tier");
    } finally {
      setTierToDelete(null);
    }
  };

  const openOptionForm = (option?: LoyaltyRedemptionOptionRow) => {
    if (option) {
      setEditingOption(option);
      setOptionForm({
        label: option.label,
        points_cost: String(option.points_cost),
        description: option.description || "",
        icon_key: option.icon_key || "tag",
        is_active: !!option.is_active,
      });
    } else {
      setEditingOption(null);
      setOptionForm({ label: "", points_cost: "0", description: "", icon_key: "tag", is_active: true });
    }
    setOptionFormOpen(true);
  };

  const saveOption = async () => {
    if (!optionForm.label.trim()) {
      toast.error("Reward label is required");
      return;
    }
    const payload = {
      user_id: user?.id,
      label: optionForm.label.trim(),
      points_cost: Number(optionForm.points_cost) || 0,
      description: optionForm.description.trim(),
      icon_key: optionForm.icon_key,
      is_active: optionForm.is_active ? 1 : 0,
      sort_order: editingOption?.sort_order ?? options.length,
    };
    try {
      if (editingOption) {
        await update("loyalty_redemption_options", editingOption.id, payload);
        toast.success("Reward updated");
      } else {
        await insert("loyalty_redemption_options", payload);
        toast.success("Reward added");
      }
      setOptionFormOpen(false);
      refetchOptions();
    } catch (e) {
      console.error(e);
      toast.error("Failed to save reward");
    }
  };

  const deleteOption = async () => {
    if (!optionToDelete) return;
    try {
      await softDelete("loyalty_redemption_options", optionToDelete);
      toast.success("Reward removed");
      refetchOptions();
    } catch (e) {
      console.error(e);
      toast.error("Failed to remove reward");
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
                  <div key={tier.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${tier.color}`} />
                      <div>
                        <div className="text-sm font-semibold">{tier.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Min spend {Number(tier.min_spend).toLocaleString()} • {tier.points_multiplier}x points
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openTierForm(tier)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setTierToDelete(tier.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
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
                    <div key={option.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-[8px] bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold flex items-center gap-2">
                            {option.label}
                            {!option.is_active && (
                              <span className="text-[10px] text-muted-foreground border rounded px-1">inactive</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {Number(option.points_cost).toLocaleString()} points
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openOptionForm(option)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setOptionToDelete(option.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
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

      <Dialog open={tierFormOpen} onOpenChange={setTierFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTier ? "Edit Tier" : "Add Tier"}</DialogTitle>
            <DialogDescription>Configure the spending threshold and rewards for this tier.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tier Name *</Label>
              <Input
                placeholder="e.g. Gold"
                value={tierForm.name}
                onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Minimum Spend</Label>
                <Input
                  type="number"
                  min={0}
                  value={tierForm.min_spend}
                  onChange={(e) => setTierForm({ ...tierForm, min_spend: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Points Multiplier</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={tierForm.points_multiplier}
                  onChange={(e) => setTierForm({ ...tierForm, points_multiplier: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={tierForm.color} onValueChange={(val) => setTierForm({ ...tierForm, color: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIER_COLORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Benefits (comma-separated)</Label>
              <Input
                placeholder="e.g. Priority support, Birthday discount 10%"
                value={tierForm.benefits}
                onChange={(e) => setTierForm({ ...tierForm, benefits: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTierFormOpen(false)}>Cancel</Button>
            <Button onClick={saveTier}>Save Tier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={optionFormOpen} onOpenChange={setOptionFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOption ? "Edit Reward" : "Add Reward"}</DialogTitle>
            <DialogDescription>Configure a points redemption option customers can claim.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reward Label *</Label>
              <Input
                placeholder="e.g. ₦500 Discount"
                value={optionForm.label}
                onChange={(e) => setOptionForm({ ...optionForm, label: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Points Cost</Label>
                <Input
                  type="number"
                  min={0}
                  value={optionForm.points_cost}
                  onChange={(e) => setOptionForm({ ...optionForm, points_cost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={optionForm.icon_key} onValueChange={(val) => setOptionForm({ ...optionForm, icon_key: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(REDEMPTION_ICONS).map((key) => (
                      <SelectItem key={key} value={key}>{key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="e.g. Get ₦500 off your next purchase"
                value={optionForm.description}
                onChange={(e) => setOptionForm({ ...optionForm, description: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={optionForm.is_active}
                onCheckedChange={(checked) => setOptionForm({ ...optionForm, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOptionFormOpen(false)}>Cancel</Button>
            <Button onClick={saveOption}>Save Reward</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
