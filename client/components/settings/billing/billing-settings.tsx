"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubscriptionStatus } from "@/lib/hooks/use-billing";
import { SubscriptionStatusAlert } from "./subscription-status-alert";
import { SubscriptionPlans } from "./subscription-plans";
import { BillingHistory } from "./billing-history";
import { ReferralTab } from "./referral-tab";

export function BillingSettings() {
  const { data: subStatus } = useSubscriptionStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Subscription & Billing</h1>
        <p className="text-muted-foreground">Manage your plan, payment methods, and referrals</p>
      </div>

      <SubscriptionStatusAlert subStatus={subStatus} />

      <Tabs defaultValue="subscription" className="space-y-6">
        <TabsList>
          <TabsTrigger value="subscription">My Subscription</TabsTrigger>
          <TabsTrigger value="referrals">Referral Program</TabsTrigger>
        </TabsList>
        <TabsContent value="subscription" className="space-y-6">
          <SubscriptionPlans />
          <BillingHistory />
        </TabsContent>
        <TabsContent value="referrals">
          <ReferralTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
