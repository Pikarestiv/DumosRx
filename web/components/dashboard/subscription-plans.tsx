"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ShieldAlert, CreditCard } from "lucide-react";

import { useInitiatePaymentMutation } from "@/lib/api/hooks";
import { toast } from "sonner";

export function SubscriptionPlans() {
  const [loading, setLoading] = useState<string | null>(null);
  const initiatePayment = useInitiatePaymentMutation();

  const handleSubscribe = async (tier: string, amount: number, planName: string) => {
    setLoading(tier);
    try {
      const response = await initiatePayment.mutateAsync({
        amount,
        plan_name: planName
      });

      if (response.success && response.payment_url) {
        window.location.href = response.payment_url;
      } else {
        toast.error(response.message || "Failed to initiate payment");
        setLoading(null);
      }
    } catch (error: any) {
      toast.error(error.message || "Payment service unavailable");
      setLoading(null);
    }
  };

  const plans = [
    {
      id: "local",
      name: "Dumos Local",
      price: "₦50,000",
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
      numericPrice: 50000,
    },
    {
      id: "pro",
      name: "Dumos Pro",
      price: "₦30,000",
      period: "/ year",
      description: "Cloud-enabled modern pharmacy management.",
      features: [
        "Everything in Local",
        "Up to 10 Staff Accounts",
        "Automatic Cloud Backups",
        "Mobile App & Remote Access",
      ],
      popular: true,
      numericPrice: 30000,
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "₦80,000",
      period: "/ year",
      description: "For chains and multi-location operations.",
      features: [
        "Unlimited Staff Accounts",
        "Multi-Store Management",
        "E-Commerce API Integrations",
        "Dedicated Account Manager",
      ],
      numericPrice: 80000,
    }
  ];

  return (
    <div className="space-y-8">
      {/* Current Plan Alert */}
      <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">You are on the Free Trial (14 Days Remaining)</p>
          <p className="text-sm">Upgrade to a paid plan below to ensure your cloud data remains protected.</p>
        </div>
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
          </Card>
        ))}
      </div>
    </div>
  );
}
