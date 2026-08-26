"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSystemConfigStore } from "@/lib/store/system-config-store";
import { useSubscriptionStatus, usePayMutation, useValidateCouponMutation, useReferralStats } from "@/lib/hooks/use-billing";
import { getSubscriptionPlans } from "@/lib/constants/subscription-plans-catalog";
import { SubscriptionPlanCard } from "./subscription-plan-card";
import { CouponInput } from "./coupon-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AppliedCoupon } from "@/lib/types/subscription-plans";

const PLAN_WEIGHT: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

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

  const { subscriptionPlans } = useSystemConfigStore();
  const { data: subStatus } = useSubscriptionStatus();
  const { data: referralStats } = useReferralStats();
  const pay = usePayMutation();
  const validateCoupon = useValidateCouponMutation();

  const userCredits = referralStats?.referral_credits || 0;
  const isYearly = billingPeriod === "yearly";
  const plans = getSubscriptionPlans(subscriptionPlans, isYearly, formatPrice);

  const handleValidateCoupon = async () => {
    if (!couponCode) return;
    setValidatingCoupon(true);
    try {
      const response = await validateCoupon.mutateAsync({ code: couponCode });
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

  const getDiscountedPrice = (numericPrice: number) => {
    if (numericPrice === 0 || !appliedCoupon) return numericPrice;
    let price = numericPrice;
    if (appliedCoupon.type === "discount_percent") price -= price * (appliedCoupon.value / 100);
    else if (appliedCoupon.type === "discount_amount") price -= appliedCoupon.value;
    if (userCredits > 0) price -= Math.min(userCredits, Math.max(0, price));
    return Math.max(0, price);
  };

  const isDiscounted = (numericPrice: number) => numericPrice > 0 && (appliedCoupon !== null || userCredits > 0);

  const isCurrentPlanHigherWeight = (planId: string) => {
    const currentWeight = PLAN_WEIGHT[subStatus?.plan?.toLowerCase() ?? "free"] ?? 0;
    return (PLAN_WEIGHT[planId] ?? 0) < currentWeight;
  };

  const handleSubscribe = async (planId: string, baseAmount: number, planName: string) => {
    setLoading(planId);
    try {
      const response = await pay.mutateAsync({
        amount: getDiscountedPrice(baseAmount),
        plan_name: planName,
        coupon_code: appliedCoupon?.code,
        interval: billingPeriod,
        use_credits: userCredits > 0,
      });

      if (response.success) {
        if (response.payment_url) {
          window.location.assign(response.payment_url);
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

      <CouponInput
        couponCode={couponCode}
        setCouponCode={setCouponCode}
        appliedCoupon={appliedCoupon}
        setAppliedCoupon={setAppliedCoupon}
        validatingCoupon={validatingCoupon}
        handleValidateCoupon={handleValidateCoupon}
      />

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
            isDiscounted={isDiscounted(plan.numericPrice)}
            discountedPrice={getDiscountedPrice(plan.numericPrice)}
            formatPrice={formatPrice}
            currentPlanName={subStatus?.plan}
            onSubscribe={handleSubscribe}
            onDowngradeRequest={setDowngradePlan}
            isCurrentPlanHigherWeight={isCurrentPlanHigherWeight}
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
