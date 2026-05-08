"use client";

import { useState, useEffect } from "react";
import { usePaystackPayment } from "react-paystack";
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
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { PRICING } from "@/lib/constants/pricing";

export function SubscriptionCard() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      setLoading(true);
      const [status, dashboard] = await Promise.all([
        webApiClient.getSubscriptionStatus(),
        webApiClient.getDashboardSummary()
      ]);
      setSubscription(status);
      setUser(dashboard.user);
    } catch (error) {
      console.error("Failed to fetch subscription", error);
    } finally {
      setLoading(false);
    }
  };

  const config = {
    reference: new Date().getTime().toString(),
    email: user?.email || "pharmacy@example.com",
    amount: PRICING.PRO.PAYSTACK_AMOUNT_KOBO,
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_KEY || "pk_test_placeholder",
  };

  const initializePayment = usePaystackPayment(config);

  const onSuccess = async (reference: any) => {
    try {
       setLoading(true);
       // In a real app, we'd send the reference to the backend to verify
       // await webApiClient.verifyPayment(reference.reference);
       toast.success("Payment successful! Upgrading your plan...");
       await fetchSubscriptionStatus();
    } catch (err) {
       toast.error("Payment verification failed. Please contact support.");
    } finally {
       setLoading(false);
    }
  };

  const onClose = () => {
    toast.info("Payment cancelled");
  };

  if (loading && !subscription) {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
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
            onClick={() => initializePayment({ onSuccess, onClose })}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Upgrade to Pro (₦{PRICING.PRO.PRICE_MONTHLY.toLocaleString()})
          </Button>
        ) : (
          <Button variant="outline" className="w-full h-12 font-bold border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5">
            <CheckCircle className="h-4 w-4 mr-2" />
            Manage Subscription
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
