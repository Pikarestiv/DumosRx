"use client";

import { useState } from "react";
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
import { Loader2, CreditCard, CheckCircle } from "lucide-react";

export function SubscriptionCard() {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState("free_trial");

  // Mock config - normally fetched from connection/settings
  const config = {
    reference: new Date().getTime().toString(),
    email: "pharmacy@example.com", // Should come from auth user
    amount: 1500000, // ₦15,000.00
    publicKey: "pk_test_your_public_key", // Needs to be an env var eventually
  };

  const initializePayment = usePaystackPayment(config);

  const onSuccess = () => {
    setLoading(true);
    // Call backend to verify transaction
    setTimeout(() => {
      setPlan("professional");
      setLoading(false);
    }, 2000);
  };

  const onClose = () => {
    console.log("closed");
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Subscription</CardTitle>
          <Badge variant={plan === "professional" ? "default" : "secondary"}>
            {plan === "professional" ? "Active" : "Trial"}
          </Badge>
        </div>
        <CardDescription>
          {plan === "professional" ? "Professional Plan" : "14-Day Free Trial"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {plan !== "professional" && (
          <div className="p-4 bg-muted rounded-lg text-sm">
            <p>
              Your trial expires in <strong>13 days</strong>.
            </p>
            <p className="text-muted-foreground mt-1">
              Upgrade to keep access to advanced analytics and unlimited
              inventory.
            </p>
          </div>
        )}

        {plan === "professional" && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span>Next billing date: Feb 20, 2026</span>
          </div>
        )}
      </CardContent>
      <CardFooter>
        {plan !== "professional" ? (
          <Button
            className="w-full"
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
          <Button variant="outline" className="w-full">
            Manage Billing
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
