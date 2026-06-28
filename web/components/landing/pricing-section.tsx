"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSystemConfig } from "@/lib/api/hooks";
import { calculateDiscountPercent } from "@/lib/utils";
import { HybridOperationsExplainer } from "./hybrid-operations-explainer";
import { PricingComparisonTable } from "./pricing-comparison-table";
import { PricingCard, PlanConfig } from "./pricing-card";

export function PricingSection() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const { data: config, isLoading } = useSystemConfig("subscription_plans");

  const isYearly = billingPeriod === "yearly";

  if (isLoading) {
    return (
      <section
        id="pricing"
        className="py-20 flex items-center justify-center min-h-[400px]"
      >
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </section>
    );
  }

  // Set up pricing fallback parameters matching system config
  const starterTier = config?.tiers?.starter || {
    price_monthly: 3000,
    price_yearly: 30000,
    active: true,
  };
  const proTier = config?.tiers?.pro || {
    price_monthly: 8000,
    price_yearly: 80000,
    active: true,
  };
  const enterpriseTier = config?.tiers?.enterprise || {
    price_monthly: 15000,
    price_yearly: 150000,
    active: true,
  };

  const yearlyDiscountPercent = calculateDiscountPercent(
    proTier.price_monthly,
    proTier.price_yearly,
  );

  const plans: PlanConfig[] = [
    {
      id: "free",
      name: "Free Standalone",
      priceMonthly: 0,
      priceYearly: 0,
      description: "Ideal for single-operator standalone desktop use.",
      features: [
        "Full POS & Stock Batch tracking",
        `${config?.tiers?.free?.limits?.staff === -1 ? "Unlimited" : config?.tiers?.free?.limits?.staff || 1} User (Owner Only)`,
        "Local Database operation",
        "Expiry & Stock Reminders",
        "EOD Sales reports",
      ],
      exclusions: [
        "No Cloud Sync & Backups",
        !config?.tiers?.free?.features?.web_dashboard
          ? "No Web Dashboard access"
          : "",
        !config?.tiers?.free?.features?.mobile_app
          ? "No Mobile Companion app"
          : "",
        !config?.tiers?.free?.features?.ecommerce
          ? "No custom store page / e-commerce"
          : "",
        !config?.tiers?.free?.features?.custom_branding
          ? "Locked to Dumos Blue light theme"
          : "",
      ].filter(Boolean),
      badge: "Free Forever",
      buttonText: "Download Standalone",
      buttonHref: "/register?plan=free",
      buttonVariant: "outline" as const,
      popular: false,
    },
    {
      id: "starter",
      name: "Starter Cloud",
      priceMonthly: starterTier.price_monthly,
      priceYearly: starterTier.price_yearly,
      description: "Cloud-connected for small growing retail teams.",
      features: [
        `Up to ${config?.tiers?.starter?.limits?.staff === -1 ? "Unlimited" : config?.tiers?.starter?.limits?.staff || 3} Staff Accounts`,
        "Cloud Database Backup",
        "6-Hour Scheduled Cloud Sync",
        config?.tiers?.starter?.features?.web_dashboard
          ? "Full Web Dashboard"
          : "Restricted Web Dashboard",
        "Prescriptions & Expenses",
      ],
      exclusions: [
        !config?.tiers?.starter?.features?.mobile_app
          ? "No Mobile Companion app"
          : "",
        !config?.tiers?.starter?.features?.ecommerce
          ? "No E-commerce Store URL"
          : "",
        !config?.tiers?.starter?.features?.smart_pos
          ? "No Smart POS suggestions"
          : "",
      ].filter(Boolean),
      badge: "Trial Available",
      buttonText: "Start Free Trial",
      buttonHref: "/register?plan=starter",
      buttonVariant: "outline" as const,
      popular: false,
    },
    {
      id: "pro",
      name: "Pro Connect",
      priceMonthly: proTier.price_monthly,
      priceYearly: proTier.price_yearly,
      description: "Remote tracking and mobile-connected stores.",
      features: [
        `Up to ${config?.tiers?.pro?.limits?.staff === -1 ? "Unlimited" : config?.tiers?.pro?.limits?.staff || 10} Staff Accounts`,
        "30-Minute Automated Cloud Sync",
        "Full Web Dashboard Analytics",
        "Mobile App Companion access",
        config?.tiers?.pro?.features?.smart_pos
          ? "Smart POS Suggestions & Receipts"
          : "",
        config?.tiers?.pro?.features?.ecommerce
          ? "E-commerce Online Store URL"
          : "",
      ].filter(Boolean),
      exclusions: [
        !config?.tiers?.pro?.features?.custom_branding
          ? "No Custom Branding"
          : "",
      ].filter(Boolean),
      badge: "Most Popular",
      buttonText: "Start Free Trial",
      buttonHref: "/register?plan=pro",
      buttonVariant: "default" as const,
      popular: true,
    },
    {
      id: "enterprise",
      name: "Enterprise Multi-Store",
      priceMonthly: enterpriseTier.price_monthly,
      priceYearly: enterpriseTier.price_yearly,
      description: "For multi-store chains and corporate networks.",
      features: [
        `${config?.tiers?.enterprise?.limits?.stores === -1 ? "Unlimited" : config?.tiers?.enterprise?.limits?.stores || "Unlimited"} Multi-Store Operations`,
        `${config?.tiers?.enterprise?.limits?.staff === -1 ? "Unlimited" : config?.tiers?.enterprise?.limits?.staff || "Unlimited"} Terminals & Users`,
        "15-Minute Automated Cloud Sync",
        "Central HQ Dashboard & Management",
        config?.tiers?.enterprise?.features?.custom_branding
          ? "White-labeling & Custom Branding"
          : "",
        "Priority Email Notifications",
        "24/7 Priority Dedicated Support",
      ].filter(Boolean),
      exclusions: [],
      badge: "High Scale",
      buttonText: "Contact Sales",
      buttonHref: "/register?plan=enterprise",
      buttonVariant: "outline" as const,
      popular: false,
    },
  ].filter((p) => config?.tiers?.[p.id]?.active !== false);

  return (
    <section
      id="pricing"
      className="py-24 bg-linear-to-b from-background via-muted/20 to-background"
    >
      <div className="container mx-auto px-4 space-y-20">
        {/* Title and Billing Toggle */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-linear-to-r from-primary to-violet-600">
            Simple, Transparent Pricing
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl">
            Start with a {config?.trial_days || 14}-day free trial on cloud
            plans. Switch or cancel anytime.
          </p>

          <div className="flex justify-center mt-8">
            <Tabs
              defaultValue="monthly"
              className="w-[300px] md:w-[400px]"
              onValueChange={(val) =>
                setBillingPeriod(val as "monthly" | "yearly")
              }
            >
              <TabsList className="grid w-full grid-cols-2 p-1 bg-muted/80 backdrop-blur rounded-full border">
                <TabsTrigger value="monthly" className="rounded-full font-bold">
                  Monthly
                </TabsTrigger>
                <TabsTrigger
                  value="yearly"
                  className="relative rounded-full font-bold"
                >
                  Yearly
                  {yearlyDiscountPercent > 0 && (
                    <Badge
                      variant="secondary"
                      className="absolute -top-3 -right-3 px-2 py-0.5 text-[10px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 border-none"
                    >
                      -{yearlyDiscountPercent}%
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {plans.map((plan) => (
            <PricingCard key={plan.id} plan={plan} isYearly={isYearly} />
          ))}
        </div>

        {/* Hybrid Offline vs Cloud Sync Explainer / Pros & Cons */}
        <HybridOperationsExplainer />

        {/* Detailed Feature Matrix Table */}
        <PricingComparisonTable />
      </div>
    </section>
  );
}
