"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ShieldAlert, CreditCard, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { useInitiatePaymentMutation, useSystemConfig } from "@/lib/api/hooks";
import { toast } from "sonner";
import { calculateDiscountPercent } from "@/lib/utils";

export function SubscriptionPlans() {
  const [loading, setLoading] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const initiatePayment = useInitiatePaymentMutation();
  const { data: config, isLoading: isConfigLoading } = useSystemConfig("subscription_plans");

  const isYearly = billingPeriod === "yearly";

  // Calculate dynamic discount percentage based on the Pro tier
  const proMonthly = config?.tiers?.pro?.price_monthly || 30000;
  const proYearly = config?.tiers?.pro?.price_yearly || 300000;
  const yearlyDiscountPercent = calculateDiscountPercent(proMonthly, proYearly);

  const handleSubscribe = async (tier: string, amount: number, planName: string) => {
    setLoading(tier);
    try {
      const response = await initiatePayment.mutateAsync({
        amount,
        plan_name: planName
      });

      if (response.success && response.payment_url) {
        window.location.assign(response.payment_url);
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

  const plans = [
    {
      id: "local",
      name: "Dumos Local",
      price: config?.tiers?.local?.price_one_time ? formatPrice(config.tiers.local.price_one_time) : "₦50,000",
      period: "One-Time",
      description: "Perfect for single offline pharmacies.",
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
      description: "Cloud-enabled modern pharmacy management.",
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
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground font-medium">{plan.period}</span>
              </div>
              
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
