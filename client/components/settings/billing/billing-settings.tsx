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
      <SubscriptionStatusAlert subStatus={subStatus} />

      <Tabs defaultValue="subscription" className="space-y-6">
        <TabsList>
          <TabsTrigger value="subscription">My Subscription</TabsTrigger>
          <TabsTrigger value="history">Billing History</TabsTrigger>
          <TabsTrigger value="referrals">Referral Program</TabsTrigger>
        </TabsList>
        <TabsContent value="subscription" className="space-y-6">
          <SubscriptionPlans />
        </TabsContent>
        <TabsContent value="history">
          <BillingHistory />
        </TabsContent>
        <TabsContent value="referrals">
          <ReferralTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
