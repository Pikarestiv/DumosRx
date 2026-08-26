"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSystemConfigStore } from "@/lib/store/system-config-store";
import { useSubscriptionStatus, usePayMutation, useValidateCouponMutation, useReferralStats } from "@/lib/hooks/use-billing";
import { queryKeys } from "@/lib/query-keys";
import { getSubscriptionPlans } from "@/lib/constants/subscription-plans-catalog";
import { getDiscountedPrice, isDiscounted, getChargeAmount, isCurrentPlanHigherWeight } from "@/lib/utils/billing-pricing";
import { SubscriptionPlanCard } from "./subscription-plan-card";
import { CouponInput } from "./coupon-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AppliedCoupon } from "@/lib/types/subscription-plans";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(price);
}

export function SubscriptionPlans() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [couponCode, setCouponCode] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [downgradePlan, setDowngradePlan] = useState<{ id: string; amount: number; name: string } | null>(null);

  const queryClient = useQueryClient();
  const { subscriptionPlans } = useSystemConfigStore();
  const { data: subStatus, isError: isStatusError } = useSubscriptionStatus();
  const { data: referralStats, isError: isReferralError } = useReferralStats();
  const pay = usePayMutation();
  const validateCoupon = useValidateCouponMutation();

  const userCredits = referralStats?.referral_credits || 0;
  const isYearly = billingPeriod === "yearly";
  const plans = getSubscriptionPlans(subscriptionPlans, isYearly, formatPrice);

  // The payment gateway opens in a new tab/window (see handleSubscribe), so
  // the user returns to this tab after paying without any route change to
  // trigger a refetch. Re-checking status on visibility/focus is the
  // cheapest way to eventually reflect a completed payment without a
  // dedicated payment-return route.
  useEffect(() => {
    const refreshStatus = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries(queryKeys.billing.status());
      }
    };

    document.addEventListener("visibilitychange", refreshStatus);
    window.addEventListener("focus", refreshStatus);

    return () => {
      document.removeEventListener("visibilitychange", refreshStatus);
      window.removeEventListener("focus", refreshStatus);
    };
  }, [queryClient]);

  const handleValidateCoupon = async () => {
    if (!couponCode) return;
    setValidatingCoupon(true);
    try {
      const response = await validateCoupon.mutateAsync({ code: couponCode, interval: billingPeriod });
      if (response.valid) {
        setAppliedCoupon(response.coupon);
        toast.success(`Coupon applied: ${response.coupon.type === "discount_percent" ? response.coupon.value + "% off" : "₦" + response.coupon.value.toLocaleString() + " off"}`);
      } else {
        toast.error(response.message || "Invalid coupon code");
        setAppliedCoupon(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to validate coupon");
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleSubscribe = async (planId: string, baseAmount: number, planName: string) => {
    setLoading(planId);
    try {
      const response = await pay.mutateAsync({
        // Only the coupon discount reduces the amount sent client-side.
        // Referral credits are applied server-side via `use_credits` --
        // subtracting them here too would double-count them.
        amount: getChargeAmount(baseAmount, appliedCoupon),
        plan_name: planName,
        coupon_code: appliedCoupon?.code,
        interval: billingPeriod,
        use_credits: userCredits > 0,
      });

      if (response.success) {
        if (response.payment_url) {
          // Never replace the app's own window location with an external
          // payment gateway: the Tauri desktop shell runs with no window
          // chrome (decorations: false), so doing so would strand the user
          // with no way back into the app.
          window.open(response.payment_url, "_blank");
        } else {
          toast.success("Subscription activated successfully!");
        }
      } else {
        toast.error(response.message || "Failed to initiate payment");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment service unavailable");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <Tabs defaultValue="monthly" className="w-[300px]" onValueChange={(val) => setBillingPeriod(val as "monthly" | "yearly")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isStatusError && (
        <p className="text-center text-sm text-destructive">
          Failed to load subscription status — check your connection.
        </p>
      )}

      <CouponInput
        couponCode={couponCode}
        setCouponCode={setCouponCode}
        appliedCoupon={appliedCoupon}
        setAppliedCoupon={setAppliedCoupon}
        validatingCoupon={validatingCoupon}
        handleValidateCoupon={handleValidateCoupon}
      />

      {isReferralError && (
        <p className="text-center text-sm text-destructive">
          Failed to load referral credits — check your connection.
        </p>
      )}

      {userCredits > 0 && (
        <div className="max-w-md mx-auto bg-primary/5 p-4 rounded-lg flex items-center justify-between border border-primary/20">
          <span className="text-sm font-semibold">Referral Credits Available</span>
          <Badge variant="secondary">₦{userCredits.toLocaleString()}</Badge>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans.map((plan) => (
          <SubscriptionPlanCard
            key={plan.id}
            plan={plan}
            isDiscounted={isDiscounted(plan.numericPrice, appliedCoupon, userCredits)}
            discountedPrice={getDiscountedPrice(plan.numericPrice, appliedCoupon, userCredits)}
            formatPrice={formatPrice}
            currentPlanName={subStatus?.plan}
            onSubscribe={handleSubscribe}
            onDowngradeRequest={setDowngradePlan}
            isCurrentPlanHigherWeight={(planId) => isCurrentPlanHigherWeight(planId, subStatus?.plan)}
            loading={loading}
          />
        ))}
      </div>

      <ConfirmDialog
        open={downgradePlan !== null}
        onOpenChange={(open) => !open && setDowngradePlan(null)}
        title="Downgrade Subscription?"
        description={`Are you sure you want to downgrade to the ${downgradePlan?.name} plan? You may lose access to premium features immediately upon downgrade.`}
        confirmLabel="Yes, Downgrade"
        variant="destructive"
        onConfirm={() => {
          if (downgradePlan) handleSubscribe(downgradePlan.id, downgradePlan.amount, downgradePlan.name);
        }}
      />
    </div>
  );
}
