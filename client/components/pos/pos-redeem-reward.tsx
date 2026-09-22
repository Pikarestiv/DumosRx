"use client";

import { useQuery } from "@tanstack/react-query";
import { Gift, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency } from "@/lib/utils";
import { getCustomerLoyaltyLedger, getLoyaltyRedemptionOptions } from "@/lib/db/queries/loyalty";
import { queryKeys } from "@/lib/query-keys";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { calculateAvailablePoints, LOYALTY_RULES } from "@/lib/utils/loyalty-calculator";
import type { RedeemedOption } from "@/lib/hooks/use-pos-cart";
import type { Customer } from "@/lib/types/customer";

interface POSRedeemRewardProps {
  selectedCustomer: Customer | null;
  redeemedOption: RedeemedOption | null;
  onRedeem: (option: { id: string; label: string; points_cost: number; discount_value: number }) => void;
  onClear: () => void;
  currencyCode?: string;
}

/** Only options staff configured with an actual naira discount value are
 * redeemable at checkout — non-monetary perks (e.g. "Free Delivery") stay
 * configurable in Settings but aren't something POS can apply as a discount.
 *
 * Rewards costing less than LOYALTY_RULES.MIN_REDEMPTION_POINTS are shown but
 * disabled with the reason, rather than hidden: staff configured them in
 * Settings and would otherwise have no idea why they never appear. Checkout
 * re-enforces the same floor server-side (applyLoyaltyPointsForSale), so this
 * is affordance, not the only gate. */
export function POSRedeemReward({
  selectedCustomer,
  redeemedOption,
  onRedeem,
  onClear,
  currencyCode,
}: POSRedeemRewardProps) {
  const { canUseLoyaltyProgram } = useFeatureGate();
  const { data: options = [] } = useQuery({
    ...queryKeys.loyalty.redemptionOptions(),
    queryFn: getLoyaltyRedemptionOptions,
    enabled: !!selectedCustomer,
  });

  // Dated points ledger, for FIFO expiry (LOYALTY_RULES.POINTS_EXPIRY_MONTHS)
  // — the balance on the customer row still includes points that have since
  // expired until a checkout materializes the deduction, so spendable points
  // have to be computed, not read.
  const { data: ledger = [] } = useQuery({
    ...queryKeys.loyalty.customerLedger(selectedCustomer?.id),
    queryFn: () => getCustomerLoyaltyLedger(selectedCustomer!.id),
    enabled: !!selectedCustomer,
  });

  const redeemableOptions = options.filter(
    (o) => o.is_active && o.discount_value > 0,
  );

  // Hidden entirely (not just disabled) when the Loyalty Program is gated
  // off (plan tier and/or the store's own on/off toggle) — matches how
  // gated features elsewhere in the app disappear rather than showing a
  // locked/disabled control, since this is an inline cart-line-item, not a
  // full-page module that would use LockedModuleOverlay.
  if (!canUseLoyaltyProgram || !selectedCustomer || redeemableOptions.length === 0) return null;

  const customerPoints = calculateAvailablePoints(
    selectedCustomer.loyalty_points || 0,
    ledger,
  );

  if (redeemedOption) {
    return (
      <div className="flex justify-between text-[12.5px] items-center gap-2">
        <span className="text-muted-foreground flex items-center gap-1">
          <Gift className="w-3.5 h-3.5 text-primary" />
          Redeeming: {redeemedOption.label}
          <span className="text-muted-foreground/70">
            ({redeemedOption.pointsCost} pts)
          </span>
        </span>
        <button
          className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
          onClick={onClear}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-between text-[12.5px] text-muted-foreground">
      <Popover>
        <PopoverTrigger asChild>
          <span className="text-primary font-semibold cursor-pointer hover:underline flex items-center gap-1">
            <Gift className="w-3.5 h-3.5" />
            Redeem Reward
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="text-[11px] text-muted-foreground px-1 pb-1.5">
            {selectedCustomer.first_name} has {customerPoints} pts
          </div>
          <div className="flex flex-col gap-1">
            {redeemableOptions.map((option) => {
              const belowMinimum =
                option.points_cost < LOYALTY_RULES.MIN_REDEMPTION_POINTS;
              const affordable = customerPoints >= option.points_cost;
              return (
                <button
                  key={option.id}
                  disabled={belowMinimum || !affordable}
                  title={
                    belowMinimum
                      ? `Minimum redemption is ${LOYALTY_RULES.MIN_REDEMPTION_POINTS} points`
                      : undefined
                  }
                  onClick={() => onRedeem(option)}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-[12.5px] hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <span>{option.label}</span>
                  <span className="text-muted-foreground text-[11px] shrink-0">
                    {belowMinimum
                      ? `Min ${LOYALTY_RULES.MIN_REDEMPTION_POINTS} pts`
                      : `${option.points_cost} pts · -${formatCurrency(option.discount_value, currencyCode)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
