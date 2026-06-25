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
import { capitalizeFirstLetter } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PRICING } from "@/lib/constants/pricing";
import { useSubscriptionStatus, useInitiatePaymentMutation } from "@/lib/api/hooks";

export function SubscriptionCard() {
  const { data: subscription, isLoading, error } = useSubscriptionStatus();
  const initiatePayment = useInitiatePaymentMutation();
  const router = useRouter();

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

  const isActive = subscription?.status === "active";
  const isInactive = subscription?.status === "inactive";
  const planName = subscription?.plan?.toLowerCase() || "";
  const isFreePlan = planName.includes("free");
  const daysLeft = Math.floor(subscription?.days_remaining || 0);
  const isTrial = subscription?.is_trial === true;
  const isExpiringSoon = daysLeft < 7 && !isFreePlan;

  let badgeTheme = "bg-emerald-500 hover:bg-emerald-600";
  let buttonTheme = "border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5";
  let bannerProps = null;

  if (isInactive) {
    badgeTheme = "bg-destructive hover:bg-destructive/90";
    buttonTheme = "border-destructive/20 text-destructive hover:bg-destructive/5";
    bannerProps = {
      container: "bg-destructive/10 border-destructive/20",
      icon: "text-destructive",
      text: "text-destructive/80",
      title: "Subscription Expired",
      desc: "Your subscription has expired. Upgrade now to restore cloud sync.",
    };
  } else if (isFreePlan) {
    badgeTheme = "bg-slate-500 hover:bg-slate-600 text-white";
    buttonTheme = "border-slate-500/20 text-slate-600 hover:bg-slate-500/5";
    bannerProps = {
      container: "bg-slate-500/10 border-slate-500/20",
      icon: "text-slate-600",
      text: "text-slate-700/80",
      title: "Free Plan",
      desc: "You are currently on the Free plan. Upgrade to unlock cloud sync.",
    };
  } else if (isTrial || isExpiringSoon) {
    badgeTheme = "bg-amber-500 hover:bg-amber-600";
    buttonTheme = "border-amber-500/20 text-amber-600 hover:bg-amber-500/5";
    bannerProps = {
      container: "bg-amber-500/10 border-amber-500/20",
      icon: "text-amber-600",
      text: "text-amber-700/80",
      title: isTrial ? "Trial Ending Soon" : "Subscription Expiring Soon",
      desc: `Your ${isTrial ? "free trial" : "subscription"} expires in ${daysLeft} days. Renew now to avoid service interruption.`,
    };
  }
  
  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  return (
    <Card className="w-full max-w-sm border-none shadow-lg overflow-hidden group">
      <div className="h-1 bg-primary w-full" />
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">Subscription</CardTitle>
          <Badge variant={isActive ? "default" : "secondary"} className={badgeTheme}>
            {isInactive ? "Inactive" : (isTrial ? "Trial" : "Active")}
          </Badge>
        </div>
        <CardDescription className="text-muted-foreground flex items-center gap-1.5 mt-1.5">
          {isInactive ? "No Active Subscription" : `${capitalizeFirstLetter(subscription.plan || PRICING.FREE.NAME)} Plan`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {bannerProps && (
          <div className={`p-4 rounded-2xl text-sm border ${bannerProps.container}`}>
            <div className={`flex items-center gap-2 font-bold mb-1 ${bannerProps.icon}`}>
              <AlertCircle className="h-4 w-4" />
              <span>{bannerProps.title}</span>
            </div>
            <p className={`leading-relaxed ${bannerProps.text}`}>
              {bannerProps.desc}
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
            <span className="font-medium capitalize">{subscription?.plan || PRICING.FREE.NAME}</span>
          </div>
          {subscription?.expires_at && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Expires on</span>
              <span className="font-medium">{formatDate(subscription.expires_at)}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        {isInactive || isFreePlan ? (
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
            className={`w-full h-12 font-bold ${buttonTheme}`}
            onClick={() => router.push("/dashboard/billing")}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Manage Subscription
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
