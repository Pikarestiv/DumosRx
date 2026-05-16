"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { PRICING } from "@/lib/constants/pricing";
import { useSubscriptionStatus, useInitiatePaymentMutation } from "@/lib/api/hooks";

export function SubscriptionCard() {
  const { data: subscription, isLoading, error } = useSubscriptionStatus();
  const initiatePayment = useInitiatePaymentMutation();

  const handleUpgrade = async () => {
    try {
      const response = await initiatePayment.mutateAsync({
        amount: PRICING.PRO.PRICE_MONTHLY,
        plan_name: PRICING.PRO.NAME
      });

      if (response.success && response.payment_url) {
        window.location.href = response.payment_url;
      } else {
        toast.error(response.message || "Failed to initiate payment");
      }
    } catch (error: any) {
      toast.error(error.message || "Payment service unavailable");
    }
  };

  if (isLoading && !subscription) {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-sm border-destructive/20">
        <CardContent className="p-6 text-center">
           <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
           <p className="text-sm text-destructive">Failed to load subscription info</p>
        </CardContent>
      </Card>
    );
  }

  const isPro = subscription?.status === "active";
  const daysLeft = subscription?.days_remaining || 0;

  return (
    <Card className="w-full max-w-sm border-none shadow-lg overflow-hidden group">
      <div className="h-1 bg-primary w-full" />
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">Subscription</CardTitle>
          <Badge variant={isPro ? "default" : "secondary"} className={isPro ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
            {isPro ? "Active" : "Trial"}
          </Badge>
        </div>
        <CardDescription>
          {isPro ? `${subscription.plan || PRICING.PRO.NAME} Plan` : "DumosRx Free Trial"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isPro && (
          <div className="p-4 bg-amber-500/10 rounded-2xl text-sm border border-amber-500/20">
            <div className="flex items-center gap-2 text-amber-600 font-bold mb-1">
              <AlertCircle className="h-4 w-4" />
              <span>Trial Ending Soon</span>
            </div>
            <p className="text-amber-700/80 leading-relaxed">
              Your free trial expires in <span className="font-bold">{daysLeft} days</span>. Upgrade now to avoid service interruption.
            </p>
          </div>
        )}
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium capitalize">{subscription?.status || 'Active'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current Plan</span>
            <span className="font-medium">{subscription?.plan || PRICING.FREE.NAME}</span>
          </div>
          {subscription?.expires_at && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Renews on</span>
              <span className="font-medium">{new Date(subscription.expires_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        {!isPro ? (
          <Button 
            className="w-full h-12 font-bold shadow-lg shadow-primary/20" 
            onClick={handleUpgrade}
            disabled={initiatePayment.isPending}
          >
            {initiatePayment.isPending ? (
               <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
               <CreditCard className="h-4 w-4 mr-2" />
            )}
            Upgrade to Pro (₦{PRICING.PRO.PRICE_MONTHLY.toLocaleString()})
          </Button>
        ) : (
          <Button 
            variant="outline" 
            className="w-full h-12 font-bold border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5"
            onClick={() => toast.info("Subscription management (cancellation/upgrades) coming soon!")}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Manage Subscription
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
