"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  ShieldAlert,
  CreditCard,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import {
  useInitiatePaymentMutation,
  useSystemConfig,
  useReferralStats,
  useSubscriptionStatus,
} from "@/lib/api/hooks";
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { calculateDiscountPercent, capitalizeFirstLetter } from "@/lib/utils";
import { getSubscriptionPlans } from "@/lib/constants/subscription-plans";
import { motion } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
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
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to validate coupon");
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
    } catch (error: any) {
      toast.error(error.message || "Payment service unavailable");
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

  const getDiscountedPrice = (plan: any) => {
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

  const isDiscounted = (plan: any) => {
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
      {(() => {
        if (subStatus?.status === "inactive") {
          return (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0 text-red-600" />
              <div className="space-y-1">
                <p className="font-medium">No Active Subscription / Expired</p>
                <p className="text-sm">
                  Upgrade or renew your plan below to ensure your cloud data
                  remains protected.
                </p>
              </div>
            </div>
          );
        }

        if (subStatus?.status === "active") {
          const daysLeft = Math.floor(Number(subStatus.days_remaining ?? 0));
          const isTrial = subStatus.is_trial === true;
          const isExpiringSoon = daysLeft < 7;

          if (isTrial || isExpiringSoon) {
            return (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">
                    {isTrial
                      ? `You are on the ${capitalizeFirstLetter(subStatus.plan || "Free")} Trial (${daysLeft} Days Remaining)`
                      : `You are on the ${capitalizeFirstLetter(subStatus.plan)} Plan (${daysLeft} Days Remaining)`}
                  </p>
                  <p className="text-sm">
                    {isTrial
                      ? "Upgrade or subscribe to a paid plan below to ensure your cloud data remains protected."
                      : "Your subscription is expiring soon. Please renew to ensure your cloud data remains protected."}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg flex items-start gap-3">
              <Check className="h-5 w-5 mt-0.5 shrink-0 text-green-600" />
              <div className="space-y-1">
                <p className="font-medium">
                  You are on the {capitalizeFirstLetter(subStatus.plan)} Plan (
                  {daysLeft} Days Remaining)
                </p>
                <p className="text-sm">
                  Your subscription is active. Thank you for protecting your
                  cloud data with DumosRx.
                </p>
              </div>
            </div>
          );
        }

        return null;
      })()}

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

      <div className="max-w-md mx-auto mb-8 bg-muted/30 p-4 rounded-lg flex items-center gap-3 border border-muted">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Have a coupon code?"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            disabled={validatingCoupon || appliedCoupon !== null}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        {appliedCoupon ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAppliedCoupon(null);
              setCouponCode("");
            }}
          >
            Remove
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleValidateCoupon}
            disabled={!couponCode || validatingCoupon}
          >
            {validatingCoupon ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Apply"
            )}
          </Button>
        )}
      </div>

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

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4"
      >
        {plans.map((plan) => (
          <motion.div key={plan.id} variants={cardVariants} className="h-full">
            <Card
              className={`relative h-full flex flex-col transition-all duration-300 bg-background/60 backdrop-blur-xl border ${plan.popular ? "border-primary border-2 shadow-2xl shadow-primary/20 scale-105 z-10" : "border-border/50 hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"}`}
            >
              <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-3 z-20">
                {plan.popular && (
                  <motion.div
                    initial={{ y: 0 }}
                    animate={{ y: [-3, 3, -3] }}
                    transition={{
                      repeat: Infinity,
                      duration: 4,
                      ease: "easeInOut",
                    }}
                    className="bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3 h-3" />
                    Recommended
                  </motion.div>
                )}
              </div>

              <CardHeader className="pt-8 pb-4">
                <CardTitle className="text-3xl font-black">
                  {plan.name}
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  {plan.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col items-start">
                <div className="flex items-baseline justify-start gap-1 mb-8">
                  {isDiscounted(plan) ? (
                    <div className="flex flex-col items-start">
                      <span className="text-xl font-bold line-through text-muted-foreground opacity-70 mb-1">
                        {plan.price}
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-black text-green-500 tracking-tight">
                          {formatPrice(getDiscountedPrice(plan))}
                        </span>
                        <span className="text-muted-foreground font-semibold">
                          {plan.period}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black tracking-tight">
                        {plan.price}
                      </span>
                      <span className="text-muted-foreground font-semibold">
                        {plan.period}
                      </span>
                    </div>
                  )}
                </div>

                {appliedCoupon?.type === "trial_extension" &&
                  (!appliedCoupon.target_plan ||
                    appliedCoupon.target_plan.toLowerCase() ===
                      plan.name.toLowerCase()) &&
                  (!appliedCoupon.target_interval ||
                    appliedCoupon.target_interval === billingPeriod) && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm font-bold text-green-600 bg-green-500/10 px-4 py-2 rounded-lg mb-6 w-full"
                    >
                      +{appliedCoupon.value} Days Free Trial
                    </motion.div>
                  )}

                <ul className="space-y-4 text-sm w-full">
                  {plan.features.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-foreground/80 font-medium text-base"
                    >
                      <Check className="h-5 w-5 text-primary shrink-0 bg-primary/10 rounded-full p-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                  {plan.missing?.map((m, i) => (
                    <li
                      key={`m-${i}`}
                      className="flex items-start gap-3 text-muted-foreground/50 text-base"
                    >
                      <div className="h-5 w-5 border border-muted-foreground/30 rounded-full shrink-0 flex items-center justify-center">
                        <div className="w-2.5 h-px bg-muted-foreground/30" />
                      </div>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              {config?.enable_paystack !== false && (
                <CardFooter className="pb-8 pt-4">
                  {(() => {
                    let buttonText =
                      plan.period === "One-Time" ? "Buy Now" : "Subscribe";
                    let buttonAction = "subscribe";

                    if (subStatus?.status === "active") {
                      const currentWeight = getPlanWeight(subStatus.plan || "");
                      const targetWeight = getPlanWeight(plan.name);

                      if (
                        currentWeight === targetWeight &&
                        !subStatus.is_trial
                      ) {
                        buttonText = "Current Plan";
                        buttonAction = "current";
                      } else if (currentWeight < targetWeight) {
                        buttonText = "Upgrade";
                        buttonAction = "upgrade";
                      } else if (currentWeight > targetWeight) {
                        buttonText = "Downgrade";
                        buttonAction = "downgrade";
                      } else if (
                        subStatus.is_trial &&
                        currentWeight === targetWeight
                      ) {
                        buttonText = "Subscribe";
                        buttonAction = "subscribe";
                      }
                    }

                    return (
                      <Button
                        className={`w-full py-6 text-lg font-bold rounded-xl transition-all ${buttonAction === "current" ? "opacity-50" : ""}`}
                        variant={plan.popular ? "default" : "outline"}
                        onClick={() => {
                          if (buttonAction === "downgrade") {
                            setDowngradePlan({
                              id: plan.id,
                              amount: plan.numericPrice,
                              name: plan.name,
                            });
                          } else {
                            handleSubscribe(
                              plan.id,
                              plan.numericPrice,
                              plan.name,
                            );
                          }
                        }}
                        disabled={
                          loading !== null || buttonAction === "current"
                        }
                      >
                        {loading === plan.id ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                          <>
                            {buttonAction !== "current" && (
                              <CreditCard className="w-5 h-5 mr-2" />
                            )}
                            {buttonText}
                          </>
                        )}
                      </Button>
                    );
                  })()}
                </CardFooter>
              )}
            </Card>
          </motion.div>
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
