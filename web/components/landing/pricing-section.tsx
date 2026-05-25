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
import { CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSystemConfig } from "@/lib/api/hooks";
import { calculateDiscountPercent } from "@/lib/utils";

export function PricingSection() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const { data: config, isLoading } = useSystemConfig("subscription_plans");

  const isYearly = billingPeriod === "yearly";

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(price);
  };

  const calculateSavings = (monthly: number, yearly: number) => {
    return (monthly * 12) - yearly;
  };

  if (isLoading) {
    return (
      <section id="pricing" className="py-20 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </section>
    );
  }

  // Fallbacks if backend isn't seeded yet
  const localTier = config?.tiers?.local || { price_one_time: 50000, active: true };
  const proTier = config?.tiers?.pro || { price_monthly: 3000, price_yearly: 30000, active: true };
  const enterpriseTier = config?.tiers?.enterprise || { price_monthly: 8000, price_yearly: 80000, active: true };

  const yearlyDiscountPercent = calculateDiscountPercent(proTier.price_monthly, proTier.price_yearly);

  return (
    <section id="pricing" className="py-20">
      <div className="container mx-auto space-y-16">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold">
            Simple, transparent pricing
          </h2>
          <p className="text-muted-foreground text-lg">
            Start your free trial today. Scale as you grow. No hidden fees.
          </p>

          <div className="flex justify-center mt-6">
            <Tabs
              defaultValue="monthly"
              className="w-[300px] md:w-[400px]"
              onValueChange={(val) =>
                setBillingPeriod(val as "monthly" | "yearly")
              }
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
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Local Plan */}
          {localTier.active && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Dumos Local</CardTitle>
                <CardDescription>For single offline pharmacies</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{formatPrice(localTier.price_one_time)}</span>
                  <span className="text-muted-foreground">/one-time</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Full POS & Inventory</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Up to 3 Staff Accounts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>No internet required</span>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant="outline" asChild>
                  <Link href="/register?plan=local">Get Started</Link>
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Pro Plan */}
          {proTier.active && (
            <Card className="border-primary shadow-lg relative">
              <div className="absolute -top-4 left-0 right-0 mx-auto w-fit bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
                Most Popular
              </div>
              <CardHeader>
                <CardTitle className="text-xl">Dumos Pro</CardTitle>
                <CardDescription>Cloud-enabled modern pharmacy management</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">
                    {isYearly 
                      ? formatPrice(proTier.price_yearly) 
                      : formatPrice(proTier.price_monthly)
                    }
                  </span>
                  <span className="text-muted-foreground">{isYearly ? "/year" : "/month"}</span>
                </div>
                <p className="text-sm text-green-600 font-medium h-5">
                  {isYearly
                    ? `Billed yearly (Save ${formatPrice(calculateSavings(proTier.price_monthly, proTier.price_yearly))})`
                    : "Billed monthly"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Everything in Local</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Up to 10 Staff Accounts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Automatic Cloud Backups</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Mobile App & Remote Access</span>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" asChild>
                  <Link href="/register?plan=pro">Start Free Trial</Link>
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Enterprise Plan */}
          {enterpriseTier.active && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Enterprise</CardTitle>
                <CardDescription>For chains & multi-location operations</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">
                    {isYearly 
                      ? formatPrice(enterpriseTier.price_yearly) 
                      : formatPrice(enterpriseTier.price_monthly)
                    }
                  </span>
                  <span className="text-muted-foreground">{isYearly ? "/year" : "/month"}</span>
                </div>
                <p className="text-sm text-green-600 font-medium h-5">
                  {isYearly
                    ? `Billed yearly (Save ${formatPrice(calculateSavings(enterpriseTier.price_monthly, enterpriseTier.price_yearly))})`
                    : "Billed monthly"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Unlimited Staff Accounts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Multi-Store Management</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>E-Commerce API Integrations</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Dedicated Account Manager</span>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant="outline" asChild>
                  <Link href="/register?plan=enterprise">Contact Sales</Link>
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
