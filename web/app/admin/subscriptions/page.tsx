"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useAdminAuthStore, checkIsSuperAdmin, checkHasPermission } from "@/lib/store/use-admin-auth-store";
import { LifecycleFiguresView } from "@/components/admin/subscriptions/lifecycle-figures";
import { BUCKETS, BucketTabsList } from "@/components/admin/subscriptions/bucket-tabs";
import { WorklistPanel } from "@/components/admin/subscriptions/worklist-panel";
import { useAdminSubscriptionLifecycle } from "@/lib/api/admin-hooks-subscriptions";

function NotAvailable() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="p-4 bg-muted text-muted-foreground rounded-full">
        <ShieldAlert className="h-10 w-10" />
      </div>
      <div>
        <p className="font-bold text-foreground">
          This page is only available to super admins
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Subscription lifecycle covers platform billing, so it is restricted.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/admin">Back to Overview</Link>
      </Button>
    </div>
  );
}

export default function SubscriptionsPage() {
  const { user } = useAdminAuthStore();
  const [days, setDays] = useState(7);

  if (!checkIsSuperAdmin(user?.role)) {
    return <NotAvailable />;
  }

  return (
    <SubscriptionsContent
      days={days}
      onDaysChange={setDays}
      canGrantTrials={checkHasPermission(user as never, "grant_trials")}
      canNotify={checkHasPermission(user as never, "send_notifications")}
    />
  );
}

function SubscriptionsContent({
  days,
  onDaysChange,
  canGrantTrials,
  canNotify,
}: {
  days: number;
  onDaysChange: (days: number) => void;
  canGrantTrials: boolean;
  canNotify: boolean;
}) {
  const { data: figures, isError: figuresError } = useAdminSubscriptionLifecycle(days);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
            <BadgeCheck className="h-8 w-8 text-indigo-500" />
            Subscriptions
          </h1>
          <p className="text-muted-foreground mt-1">
            The accounts that need attention, and the actions that resolve them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((option) => (
            <Button
              key={option}
              variant={option === days ? "default" : "outline"}
              size="sm"
              onClick={() => onDaysChange(option)}
            >
              {option}d
            </Button>
          ))}
        </div>
      </div>

      <LifecycleFiguresView data={figures} isError={figuresError} />

      <Tabs defaultValue="expiring" className="w-full">
        <BucketTabsList counts={figures?.bucket_counts} />

        {BUCKETS.map((bucket) => (
          <TabsContent key={bucket.id} value={bucket.id} className="focus-visible:outline-none">
            <WorklistPanel
              bucket={bucket.id}
              days={days}
              canGrantTrials={canGrantTrials}
              canNotify={canNotify}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
