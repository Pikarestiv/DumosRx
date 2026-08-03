"use client";

import { useState } from "react";


import {
  Loader2,
  Info,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import {
  useInitiatePaymentMutation,
  useSystemConfig,
  useReferralStats,
  useSubscriptionStatus,
} from "@/lib/api/hooks";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { calculateDiscountPercent } from "@/lib/utils";
import { getSubscriptionPlans, type SubscriptionPlan } from "@/lib/constants/subscription-plans";
import { motion } from "framer-motion";
import { SubscriptionPlanCard } from "./subscription-plan-card";
import { CouponInput } from "./coupon-input";
import { SubscriptionStatusAlert } from "./subscription-status-alert";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export function SubscriptionPlans() {
  const [loading, setLoading] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const [couponCode, setCouponCode] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    type: string;
    value: number;
    target_plan: string | null;
    target_interval: string | null;
  } | null>(null);
  const [useCredits, setUseCredits] = useState(false);
  const [downgradePlan, setDowngradePlan] = useState<{
    id: string;
    amount: number;
    name: string;
  } | null>(null);

  const initiatePayment = useInitiatePaymentMutation();
  const { data: subStatus } = useSubscriptionStatus();
  const { data: config, isLoading: isConfigLoading } =
    useSystemConfig("subscription_plans");
  const { data: referralStats } = useReferralStats();

  const userCredits = referralStats?.referral_credits || 0;

  const isYearly = billingPeriod === "yearly";

  // Calculate dynamic discount percentage based on the Pro tier
  const proMonthly = config?.tiers?.pro?.price_monthly || 8000;
  const proYearly = config?.tiers?.pro?.price_yearly || 80000;
  const yearlyDiscountPercent = calculateDiscountPercent(proMonthly, proYearly);

  const handleValidateCoupon = async () => {
    if (!couponCode) return;
    setValidatingCoupon(true);
    try {
      const response = await webApiClient.validateCoupon({ code: couponCode });
      if (response.valid) {
        setAppliedCoupon(response.coupon);
        toast.success(
          `Coupon applied: ${response.coupon.type === "discount_percent" ? response.coupon.value + "% off" : response.coupon.type === "discount_amount" ? "₦" + response.coupon.value.toLocaleString() + " off" : "+" + response.coupon.value + " days"}`,
        );
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

  const handleSubscribe = async (
    tier: string,
    baseAmount: number,
    planName: string,
  ) => {
    setLoading(tier);

    let amountAfterCoupon = baseAmount;
    if (appliedCoupon?.type === "discount_percent") {
      amountAfterCoupon = baseAmount - baseAmount * (appliedCoupon.value / 100);
    } else if (appliedCoupon?.type === "discount_amount") {
      amountAfterCoupon = baseAmount - appliedCoupon.value;
    }

    if (amountAfterCoupon < 0) amountAfterCoupon = 0;

    try {
      const response = await initiatePayment.mutateAsync({
        amount: amountAfterCoupon,
        plan_name: planName,
        coupon_code: appliedCoupon?.code,
        interval: billingPeriod,
        use_credits: useCredits,
      });

      if (response.success) {
        if (response.payment_url) {
          window.location.assign(response.payment_url);
        } else {
          // It was a free checkout!
          toast.success("Subscription activated successfully!");
          window.location.reload();
        }
      } else {
        toast.error(response.message || "Failed to initiate payment");
        setLoading(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment service unavailable");
      setLoading(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const getDiscountedPrice = (plan: SubscriptionPlan) => {
    if (plan.numericPrice === 0) return 0;

    let price = plan.numericPrice;

    if (
      appliedCoupon?.type === "discount_percent" &&
      (!appliedCoupon.target_plan ||
        appliedCoupon.target_plan.toLowerCase() === plan.name.toLowerCase()) &&
      (!appliedCoupon.target_interval ||
        appliedCoupon.target_interval === billingPeriod)
    ) {
      price = price - price * (appliedCoupon.value / 100);
    } else if (
      appliedCoupon?.type === "discount_amount" &&
      (!appliedCoupon.target_plan ||
        appliedCoupon.target_plan.toLowerCase() === plan.name.toLowerCase()) &&
      (!appliedCoupon.target_interval ||
        appliedCoupon.target_interval === billingPeriod)
    ) {
      price = price - appliedCoupon.value;
    }

    if (useCredits && userCredits > 0) {
      const creditsApplied = Math.min(userCredits, Math.max(0, price));
      price = price - creditsApplied;
    }

    return Math.max(0, price);
  };

  const isDiscounted = (plan: SubscriptionPlan) => {
    if (plan.numericPrice === 0) return false;

    const hasCoupon =
      (appliedCoupon?.type === "discount_percent" ||
        appliedCoupon?.type === "discount_amount") &&
      (!appliedCoupon.target_plan ||
        appliedCoupon.target_plan.toLowerCase() === plan.name.toLowerCase()) &&
      (!appliedCoupon.target_interval ||
        appliedCoupon.target_interval === billingPeriod);

    const hasCredits = useCredits && userCredits > 0;
    return hasCoupon || hasCredits;
  };

  const getPlanWeight = (planName: string) => {
    if (!planName) return -1;
    const lower = planName.toLowerCase();
    if (lower.includes("enterprise")) return 3;
    if (lower.includes("pro")) return 2;
    if (lower.includes("starter")) return 1;
    if (lower.includes("free")) return 0;
    return -1;
  };

  const plans = getSubscriptionPlans(config, isYearly, formatPrice);

  if (isConfigLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Current Plan Alert */}
      <SubscriptionStatusAlert subStatus={subStatus} />

      <div className="flex justify-center my-8">
        <Tabs
          defaultValue="monthly"
          className="w-[300px] md:w-[400px]"
          onValueChange={(val) => setBillingPeriod(val as "monthly" | "yearly")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly" className="relative">
              Yearly
              {yearlyDiscountPercent > 0 && (
                <Badge
                  variant="secondary"
                  className="absolute -top-3 -right-3 px-1.5 py-0.5 text-[10px] bg-green-500 text-white hover:bg-green-600"
                >
                  -{yearlyDiscountPercent}%
                </Badge>
              )}
            </TabsTrigger>
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
        <div className="max-w-md mx-auto mb-8 bg-primary/5 p-4 rounded-lg flex items-center justify-between border border-primary/20">
          <div className="space-y-0.5">
            <span className="text-sm font-semibold">
              Apply Referral Credits
            </span>
            <p className="text-xs text-muted-foreground">
              Available balance: ₦{userCredits.toLocaleString()}
            </p>
          </div>
          <input
            type="checkbox"
            checked={useCredits}
            onChange={(e) => setUseCredits(e.target.checked)}
            className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-ring"
          />
        </div>
      )}

      {config?.enable_manual_payment && (
        <div className="max-w-3xl mx-auto mb-8 bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
          <h3 className="text-lg font-bold text-blue-800 dark:text-blue-300 mb-2">Prefer to pay via Direct Transfer?</h3>
          <p className="text-sm text-blue-700 dark:text-blue-400 mb-4">
            If you're having trouble with the online payment gateway, you can transfer directly to our corporate bank account. Your account will be upgraded manually after verification.
          </p>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Bank</p>
              <p className="font-bold">{config.manual_payment_bank || "Moniepoint"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Account Number</p>
              <p className="font-bold text-xl tracking-wider text-primary">{config.manual_payment_account_number || "6656081317"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Account Name</p>
              <p className="font-bold">{config.manual_payment_account_name || "Dumos Technologies"}</p>
            </div>
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-4 font-medium flex items-center gap-1">
            <Info className="w-4 h-4" />
            After payment, please send your receipt to {SUPPORT_EMAIL} or contact our support team.
          </p>
        </div>
      )}

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4"
      >
        {plans.map((plan) => (
          <SubscriptionPlanCard
            key={plan.id}
            plan={plan}
            isDiscounted={isDiscounted(plan)}
            formatPrice={formatPrice}
            getDiscountedPrice={getDiscountedPrice(plan)}
            appliedCoupon={appliedCoupon}
            billingPeriod={billingPeriod}
            config={config}
            subStatus={subStatus}
            getPlanWeight={getPlanWeight}
            handleSubscribe={handleSubscribe}
            setDowngradePlan={setDowngradePlan}
            loading={loading}
            cardVariants={cardVariants}
          />
        ))}
      </motion.div>

      <ConfirmDialog
        open={downgradePlan !== null}
        onOpenChange={(open) => !open && setDowngradePlan(null)}
        title="Downgrade Subscription?"
        description={`Are you sure you want to downgrade to the ${downgradePlan?.name} plan? You may lose access to premium features like cloud backups, extra staff accounts, mobile app companion, and smart POS suggestions immediately upon downgrade.`}
        confirmLabel="Yes, Downgrade"
        variant="destructive"
        onConfirm={() => {
          if (downgradePlan) {
            handleSubscribe(
              downgradePlan.id,
              downgradePlan.amount,
              downgradePlan.name,
            );
          }
        }}
      />
    </div>
  );
}
