"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ShieldAlert, CreditCard, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { useInitiatePaymentMutation, useSystemConfig, useReferralStats } from "@/lib/api/hooks";
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { calculateDiscountPercent } from "@/lib/utils";

export function SubscriptionPlans() {
  const [loading, setLoading] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [couponCode, setCouponCode] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{code: string, type: string, value: number, target_plan: string | null, target_interval: string | null} | null>(null);
  const [useCredits, setUseCredits] = useState(false);
  
  const initiatePayment = useInitiatePaymentMutation();
  const { data: config, isLoading: isConfigLoading } = useSystemConfig("subscription_plans");
  const { data: referralStats } = useReferralStats();

  const userCredits = referralStats?.referral_credits || 0;

  const isYearly = billingPeriod === "yearly";

  // Calculate dynamic discount percentage based on the Pro tier
  const proMonthly = config?.tiers?.pro?.price_monthly || 30000;
  const proYearly = config?.tiers?.pro?.price_yearly || 300000;
  const yearlyDiscountPercent = calculateDiscountPercent(proMonthly, proYearly);

  const handleValidateCoupon = async () => {
    if (!couponCode) return;
    setValidatingCoupon(true);
    try {
      const response = await webApiClient.validateCoupon({ code: couponCode });
      if (response.valid) {
        setAppliedCoupon(response.coupon);
        toast.success(`Coupon applied: ${response.coupon.type === 'discount_percent' ? response.coupon.value + '% off' : '+' + response.coupon.value + ' days'}`);
      } else {
        toast.error(response.message || 'Invalid coupon code');
        setAppliedCoupon(null);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to validate coupon');
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleSubscribe = async (tier: string, baseAmount: number, planName: string) => {
    setLoading(tier);
    
    let amountAfterCoupon = baseAmount;
    if (appliedCoupon?.type === 'discount_percent') {
      amountAfterCoupon = baseAmount - (baseAmount * (appliedCoupon.value / 100));
    }

    if (amountAfterCoupon < 0) amountAfterCoupon = 0;

    try {
      const response = await initiatePayment.mutateAsync({
        amount: amountAfterCoupon,
        plan_name: planName,
        coupon_code: appliedCoupon?.code,
        interval: billingPeriod,
        use_credits: useCredits
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
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(price);
  };

  const getDiscountedPrice = (plan: any) => {
    let price = plan.numericPrice;
    
    // Apply coupon
    if (appliedCoupon?.type === 'discount_percent' && 
       (!appliedCoupon.target_plan || appliedCoupon.target_plan.toLowerCase() === plan.name.toLowerCase()) && 
       (!appliedCoupon.target_interval || appliedCoupon.target_interval === billingPeriod)) {
      price = price - (price * (appliedCoupon.value / 100));
    }

    // Apply credits
    if (useCredits && userCredits > 0) {
      const creditsApplied = Math.min(userCredits, price);
      price = price - creditsApplied;
    }

    return price;
  };

  const isDiscounted = (plan: any) => {
    const hasCoupon = appliedCoupon?.type === 'discount_percent' && 
       (!appliedCoupon.target_plan || appliedCoupon.target_plan.toLowerCase() === plan.name.toLowerCase()) && 
       (!appliedCoupon.target_interval || appliedCoupon.target_interval === billingPeriod);

    const hasCredits = useCredits && userCredits > 0;
    return hasCoupon || hasCredits;
  };

  const plans = [
    {
      id: "local",
      name: "Dumos Local",
      price: config?.tiers?.local?.price_one_time ? formatPrice(config.tiers.local.price_one_time) : "₦50,000",
      period: "One-Time",
      description: "Perfect for single offline stores.",
      features: [
        "Full POS & Inventory",
        "Up to 3 Staff Accounts",
        "No internet required",
        "One-time setup",
      ],
      missing: [
        "No Cloud Backups",
        "No Mobile App Access",
      ],
      numericPrice: config?.tiers?.local?.price_one_time || 50000,
      active: config?.tiers?.local?.active !== false,
    },
    {
      id: "pro",
      name: "Dumos Pro",
      price: isYearly 
        ? (config?.tiers?.pro?.price_yearly ? formatPrice(config.tiers.pro.price_yearly) : "₦300,000")
        : (config?.tiers?.pro?.price_monthly ? formatPrice(config.tiers.pro.price_monthly) : "₦30,000"),
      period: isYearly ? "/ year" : "/ month",
      description: "Cloud-enabled modern store management.",
      features: [
        "Everything in Local",
        "Up to 10 Staff Accounts",
        "Automatic Cloud Backups",
        "Mobile App & Remote Access",
      ],
      popular: true,
      numericPrice: isYearly 
        ? (config?.tiers?.pro?.price_yearly || 300000)
        : (config?.tiers?.pro?.price_monthly || 30000),
      active: config?.tiers?.pro?.active !== false,
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: isYearly 
        ? (config?.tiers?.enterprise?.price_yearly ? formatPrice(config.tiers.enterprise.price_yearly) : "₦800,000")
        : (config?.tiers?.enterprise?.price_monthly ? formatPrice(config.tiers.enterprise.price_monthly) : "₦80,000"),
      period: isYearly ? "/ year" : "/ month",
      description: "For chains and multi-location operations.",
      features: [
        "Unlimited Staff Accounts",
        "Multi-Store Management",
        "E-Commerce API Integrations",
        "Dedicated Account Manager",
      ],
      numericPrice: isYearly 
        ? (config?.tiers?.enterprise?.price_yearly || 800000)
        : (config?.tiers?.enterprise?.price_monthly || 80000),
      active: config?.tiers?.enterprise?.active !== false,
    }
  ].filter(p => p.active);

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
      <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">You are on the Free Trial ({config?.trial_days || 14} Days Remaining)</p>
          <p className="text-sm">Upgrade to a paid plan below to ensure your cloud data remains protected.</p>
        </div>
      </div>

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
          <Button variant="outline" size="sm" onClick={() => { setAppliedCoupon(null); setCouponCode(""); }}>
            Remove
          </Button>
        ) : (
          <Button size="sm" onClick={handleValidateCoupon} disabled={!couponCode || validatingCoupon}>
            {validatingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
          </Button>
        )}
      </div>

      {userCredits > 0 && (
        <div className="max-w-md mx-auto mb-8 bg-primary/5 p-4 rounded-lg flex items-center justify-between border border-primary/20">
          <div className="space-y-0.5">
            <span className="text-sm font-semibold">Apply Referral Credits</span>
            <p className="text-xs text-muted-foreground">Available balance: ₦{userCredits.toLocaleString()}</p>
          </div>
          <input
            type="checkbox"
            checked={useCredits}
            onChange={(e) => setUseCredits(e.target.checked)}
            className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-ring"
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.id} className={`flex flex-col relative ${plan.popular ? 'border-primary shadow-md' : ''}`}>
            {plan.popular && (
              <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2">
                <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Recommended
                </span>
              </div>
            )}
            <CardHeader>
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-6">
              <div className="flex items-baseline gap-1">
                {isDiscounted(plan) ? (
                  <>
                    <span className="text-xl font-bold line-through text-muted-foreground mr-2">{plan.price}</span>
                    <span className="text-3xl font-bold text-green-600">
                      {formatPrice(getDiscountedPrice(plan))}
                    </span>
                  </>
                ) : (
                  <span className="text-3xl font-bold">{plan.price}</span>
                )}
                <span className="text-muted-foreground font-medium">{plan.period}</span>
              </div>
              {appliedCoupon?.type === 'trial_extension' && 
               (!appliedCoupon.target_plan || appliedCoupon.target_plan.toLowerCase() === plan.name.toLowerCase()) && 
               (!appliedCoupon.target_interval || appliedCoupon.target_interval === billingPeriod) && (
                 <div className="text-sm font-medium text-green-600 bg-green-50 p-2 rounded-md">
                   Includes +{appliedCoupon.value} Days Free Trial
                 </div>
              )}
              
              <ul className="space-y-3 text-sm">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
                {plan.missing?.map((m, i) => (
                  <li key={`m-${i}`} className="flex items-center gap-2 text-muted-foreground opacity-70">
                    <div className="h-4 w-4 border border-muted-foreground rounded-full shrink-0 flex items-center justify-center">
                       <div className="w-2 h-px bg-muted-foreground" />
                    </div>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            {config?.enable_paystack !== false && (
              <CardFooter>
                <Button 
                  className="w-full" 
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => handleSubscribe(plan.id, plan.numericPrice, plan.name)}
                  disabled={loading !== null}
                >
                  {loading === plan.id ? "Processing..." : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      {plan.period === "One-Time" ? "Buy Now" : "Subscribe"}
                    </>
                  )}
                </Button>
              </CardFooter>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
