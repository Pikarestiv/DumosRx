import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { insert, update } from "@/lib/db/local-database";
import type { LoyaltyTierRow, LoyaltyRedemptionOptionRow } from "@/lib/db/queries/loyalty";

interface TierFormState {
  name: string;
  min_spend: string;
  points_multiplier: string;
  benefits: string;
  color: string;
}

interface SaveTierParams {
  form: TierFormState;
  tier: LoyaltyTierRow | null;
  userId?: string;
  nextSortOrder: number;
}

export function useSaveLoyaltyTierMutation() {
  return useMutation({
    mutationFn: async ({ form, tier, userId, nextSortOrder }: SaveTierParams) => {
      const payload = {
        user_id: userId,
        name: form.name.trim(),
        min_spend: Number(form.min_spend) || 0,
        points_multiplier: Number(form.points_multiplier) || 1,
        benefits: JSON.stringify(form.benefits.split(",").map((b) => b.trim()).filter(Boolean)),
        color: form.color,
        sort_order: tier?.sort_order ?? nextSortOrder,
      };
      if (tier) {
        await update("loyalty_tiers", tier.id, payload);
      } else {
        await insert("loyalty_tiers", payload);
      }
    },
    onSuccess: (_data, { tier }) => {
      toast.success(tier ? "Tier updated" : "Tier added");
    },
    onError: (e) => {
      console.error(e);
      toast.error("Failed to save tier");
    },
  });
}

interface RedemptionFormState {
  label: string;
  points_cost: string;
  discount_value: string;
  description: string;
  icon_key: string;
  is_active: boolean;
}

interface SaveRedemptionOptionParams {
  form: RedemptionFormState;
  option: LoyaltyRedemptionOptionRow | null;
  userId?: string;
  nextSortOrder: number;
}

export function useSaveLoyaltyRedemptionOptionMutation() {
  return useMutation({
    mutationFn: async ({ form, option, userId, nextSortOrder }: SaveRedemptionOptionParams) => {
      const payload = {
        user_id: userId,
        label: form.label.trim(),
        points_cost: Number(form.points_cost) || 0,
        discount_value: Number(form.discount_value) || 0,
        description: form.description.trim(),
        icon_key: form.icon_key,
        is_active: form.is_active ? 1 : 0,
        sort_order: option?.sort_order ?? nextSortOrder,
      };
      if (option) {
        await update("loyalty_redemption_options", option.id, payload);
      } else {
        await insert("loyalty_redemption_options", payload);
      }
    },
    onSuccess: (_data, { option }) => {
      toast.success(option ? "Reward updated" : "Reward added");
    },
    onError: (e) => {
      console.error(e);
      toast.error("Failed to save reward");
    },
  });
}
