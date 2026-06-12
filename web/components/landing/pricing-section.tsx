"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSystemConfig } from "@/lib/api/hooks";
import { calculateDiscountPercent } from "@/lib/utils";
import { HybridOperationsExplainer } from "./hybrid-operations-explainer";
import { PricingComparisonTable } from "./pricing-comparison-table";

export function PricingSection() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const { data: config, isLoading } = useSystemConfig("subscription_plans");

  const isYearly = billingPeriod === "yearly";

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const calculateSavings = (monthly: number, yearly: number) => {
    return monthly * 12 - yearly;
  };

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

  const plans = [
    {
      id: "free",
      name: "Free Standalone",
      priceMonthly: 0,
      priceYearly: 0,
      description: "Ideal for single-operator standalone desktop use.",
      features: [
        "Full POS & Inventory tracking",
        "1 User (Owner Only)",
        "Local Database operation",
        "Expiry & Stock Reminders",
        "EOD Sales reports",
      ],
      exclusions: [
        "No Cloud Sync & Backups",
        "No Web Dashboard access",
        "No Mobile Companion app",
        "No custom store page / e-commerce",
        "Locked to Dumos Blue light theme",
      ],
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
        "1 Local Host + 2 LAN Cashier Clients",
        "Up to 3 Staff Accounts",
        "Cloud Database Backup",
        "6-Hour Scheduled Cloud Sync",
        "Restricted Web Dashboard",
        "Prescriptions & Expenses",
      ],
      exclusions: [
        "No Mobile Companion app",
        "No E-commerce Store URL",
        "No Smart POS suggestions",
      ],
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
        "Desktop Host + Unlimited LAN Clients",
        "Up to 10 Staff Accounts",
        "15-Minute Automated Cloud Sync",
        "Full Web Dashboard Analytics",
        "Mobile App Companion access",
        "Smart POS Suggestions & Receipts",
        "E-commerce Online Store URL",
      ],
      exclusions: [],
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
        "Unlimited Multi-Store Operations",
        "Unlimited Terminals & Users",
        "Real-time Instant Cloud Sync",
        "Central HQ Dashboard & Management",
        "White-labeling & Custom Branding",
        "Priority SMS/Email Notifications",
        "24/7 Priority Dedicated Support",
      ],
      exclusions: [],
      badge: "High Scale",
      buttonText: "Contact Sales",
      buttonHref: "/register?plan=enterprise",
      buttonVariant: "outline" as const,
      popular: false,
    },
  ];

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
          {plans.map((plan) => {
            const price = isYearly ? plan.priceYearly : plan.priceMonthly;
            const savings = calculateSavings(
              plan.priceMonthly,
              plan.priceYearly,
            );
            return (
              <Card
                key={plan.id}
                className={`flex flex-col relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                  plan.popular
                    ? "border-primary ring-2 ring-primary/20 shadow-lg"
                    : "border-muted"
                }`}
              >
                {plan.badge && (
                  <div
                    className={`absolute top-0 right-0 transform translate-x-1 translate-y-2 mr-3`}
                  >
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        plan.popular
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {plan.badge}
                    </span>
                  </div>
                )}

                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold">
                    {plan.name}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 min-h-[40px] text-sm mt-1">
                    {plan.description}
                  </CardDescription>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold tracking-tight">
                      {price === 0 ? "₦0" : formatPrice(price)}
                    </span>
                    <span className="text-muted-foreground text-sm font-medium">
                      {price === 0 ? "" : isYearly ? "/year" : "/month"}
                    </span>
                  </div>
                  <div className="h-5">
                    {price > 0 && isYearly && (
                      <p className="text-xs text-emerald-600 font-semibold">
                        Save {formatPrice(savings)} / year
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="grow space-y-5 pt-0">
                  <div className="border-t border-muted my-2" />
                  <ul className="space-y-3 text-xs md:text-sm">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-foreground/90 font-medium">
                          {feature}
                        </span>
                      </li>
                    ))}
                    {plan.exclusions.map((exclusion, i) => (
                      <li
                        key={`ex-${i}`}
                        className="flex items-start gap-2 opacity-60 text-muted-foreground"
                      >
                        <XCircle className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-0.5" />
                        <span className="line-through">{exclusion}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="pt-2">
                  <Button
                    className="w-full font-bold py-5 rounded-xl shadow-md"
                    variant={plan.buttonVariant}
                    asChild
                  >
                    <Link href={plan.buttonHref}>{plan.buttonText}</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Hybrid Offline vs Cloud Sync Explainer / Pros & Cons */}
        <HybridOperationsExplainer />

        {/* Detailed Feature Matrix Table */}
        <PricingComparisonTable />
      </div>
    </section>
  );
}
