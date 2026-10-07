"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ScrollText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { AdminActionsView } from "@/components/admin/activity/admin-actions-view";
import { ActivityFeedPanel } from "@/components/admin/activity/activity-feed-panel";

export default function AdminActivityLogPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <ActivityTabs />
    </Suspense>
  );
}

function ActivityTabs() {
  const searchParams = useSearchParams();
  // A deep link from the store or user row actions targets the admin-actions
  // table; Radix unmounts the inactive tab, so landing on the Feed would drop
  // the filter without saying so.
  const deepLinked = searchParams.get("store_id") || searchParams.get("user_id");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
          <ScrollText className="h-8 w-8 text-indigo-500" />
          Activity
        </h1>
        <p className="text-muted-foreground mt-1">
          Everything happening on the platform, in one place.
        </p>
      </div>

      <Tabs defaultValue={deepLinked ? "admin-actions" : "feed"} className="w-full">
        <TabsList className="mb-4 bg-muted w-full flex overflow-x-auto whitespace-nowrap justify-start p-1 h-12 gap-1">
          <TabsTrigger value="feed" className="px-4 shrink-0">
            Feed
          </TabsTrigger>
          <TabsTrigger value="admin-actions" className="px-4 shrink-0">
            Admin actions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="focus-visible:outline-none">
          <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-0">
              <ActivityFeedPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admin-actions" className="focus-visible:outline-none">
          <AdminActionsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
