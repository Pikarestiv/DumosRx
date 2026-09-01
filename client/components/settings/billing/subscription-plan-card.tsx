"use client";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import type { SubscriptionPlanCatalogEntry } from "@/lib/constants/subscription-plans-catalog";
import { isCurrentPlan } from "@/lib/utils/billing-pricing";

interface SubscriptionPlanCardProps {
  plan: SubscriptionPlanCatalogEntry;
  isDiscounted: boolean;
  discountedPrice: number;
  formatPrice: (price: number) => string;
  currentPlanName: string | undefined;
  onSubscribe: (planId: string, amount: number, planName: string) => void;
  onDowngradeRequest: (plan: { id: string; amount: number; name: string }) => void;
  isCurrentPlanHigherWeight: (planId: string) => boolean;
  loading: string | null;
  paymentTabOpen: boolean;
}

export function SubscriptionPlanCard({
  plan,
  isDiscounted,
  discountedPrice,
  formatPrice,
  currentPlanName,
  onSubscribe,
  onDowngradeRequest,
  isCurrentPlanHigherWeight,
  loading,
  paymentTabOpen,
}: SubscriptionPlanCardProps) {
  const isCurrent = isCurrentPlan(currentPlanName, plan.id);
  const isDowngrade = isCurrentPlanHigherWeight(plan.id);

  return (
    <Card
      className={`relative h-full flex flex-col ${
        isCurrent
          ? "border-emerald-500 border-2 shadow-xl"
          : plan.popular
            ? "border-primary border-2 shadow-xl"
            : "border-border/50"
      }`}
    >
      {isCurrent && (
        <div className="absolute top-0 left-0 transform -translate-x-3 -translate-y-3 z-10 bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" />
          Current Plan
        </div>
      )}
      {plan.popular && (
        <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-3 z-10 bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          Recommended
        </div>
      )}
      <CardHeader className="pt-8 pb-4">
        <CardTitle className="text-2xl font-black">{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-start gap-4">
        <div className="flex items-baseline gap-1">
          {isDiscounted ? (
            <>
              <span className="text-lg font-bold line-through text-muted-foreground opacity-70 mr-2">
                {plan.price}
              </span>
              <span className="text-4xl font-black text-green-500 tracking-tight">
                {formatPrice(discountedPrice)}
              </span>
            </>
          ) : (
            <span className="text-4xl font-black tracking-tight">{plan.price}</span>
          )}
          <span className="text-muted-foreground font-semibold">{plan.period}</span>
        </div>
        <ul className="space-y-2">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full font-bold"
          disabled={isCurrent || loading !== null || paymentTabOpen}
          variant={isDowngrade ? "outline" : "default"}
          onClick={() =>
            isDowngrade
              ? onDowngradeRequest({ id: plan.id, amount: plan.numericPrice, name: plan.name })
              : onSubscribe(plan.id, plan.numericPrice, plan.name)
          }
        >
          {loading === plan.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isCurrent ? (
            "Current Plan"
          ) : isDowngrade ? (
            "Downgrade"
          ) : (
            "Subscribe"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
