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
    amount: 1500000, // ₦15,000.00
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
          {isPro ? `${subscription.plan || 'Professional'} Plan` : "DumosRx Free Trial"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isPro && (
          <div className="p-4 bg-amber-500/10 rounded-2xl text-sm border border-amber-500/20">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold mb-1">
              <AlertCircle className="h-4 w-4" />
              <span>Action Required</span>
            </div>
            <p className="text-muted-foreground">
              Your trial expires in <strong className="text-foreground">{daysLeft} days</strong>.
              Upgrade to keep your pharmacy data synced.
            </p>
          </div>
        )}

        {isPro && (
          <div className="p-4 bg-emerald-500/10 rounded-2xl text-sm border border-emerald-500/20">
             <div className="flex items-center gap-2 text-emerald-600 font-bold">
                <CheckCircle className="h-5 w-5" />
                <span>Renewing automatically</span>
             </div>
             <p className="text-xs text-muted-foreground mt-1 ml-7">
                Your next billing date is in {daysLeft} days.
             </p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        {!isPro ? (
          <Button
            className="w-full font-bold h-11 rounded-xl shadow-lg shadow-primary/20"
            onClick={() => initializePayment({ onSuccess, onClose })}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="animate-spin mr-2" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            Upgrade to Pro (₦15,000)
          </Button>
        ) : (
          <Button variant="outline" className="w-full font-bold h-11 rounded-xl">
            Manage Billing
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
