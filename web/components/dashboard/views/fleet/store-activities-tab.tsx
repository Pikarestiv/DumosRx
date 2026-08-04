"use client";

import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { ActivityDetails, filterIndirectSaleLogs } from "../activities/activities-shared";
import type { StoreDetail } from "@/lib/types/dashboard";

export function StoreActivitiesTab({ store, storeId }: { store: StoreDetail; storeId: string }) {
  const router = useRouter();

  const filteredActivities = store.recent_activities
    ? store.recent_activities.filter((act) =>
        filterIndirectSaleLogs(store.recent_activities!, act),
      )
    : [];
  const previewActivities = filteredActivities.slice(0, 10);

  if (filteredActivities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Activity className="h-8 w-8 opacity-20 mb-2" />
        <p className="font-medium">
          No recent activities found for this store
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {previewActivities.map((act) => (
        <div
          key={act.id}
          className="p-4 border rounded-xl flex items-start gap-4"
        >
          <div className="mt-1">
            <Activity className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm flex items-center gap-2">
              <span className="uppercase tracking-wider text-[10px] bg-muted px-2 py-0.5 rounded">
                {act.action}
              </span>
              <span>
                {act.table_name ||
                  act.properties?.table_name ||
                  "System"}
              </span>
            </p>
            <ActivityDetails
              details={
                act.details ||
                act.properties?.details ||
                act.description
              }
              tableName={
                act.table_name || act.properties?.table_name
              }
              action={act.action}
            />
          </div>
          <div className="text-right whitespace-nowrap">
            <p className="text-xs font-bold">
              {act.user?.name || act.user?.first_name || "System"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {act.created_at ? new Date(act.created_at).toLocaleString() : ""}
            </p>
          </div>
        </div>
      ))}
      {filteredActivities.length > 0 && (
        <div className="pt-4 flex justify-center">
          <Button
            variant="outline"
            className="w-full text-primary border-primary hover:text-white hover:bg-primary"
            onClick={() =>
              router.push(
                `/dashboard/staff/activities?storeId=${storeId}`,
              )
            }
          >
            View All Activities
          </Button>
        </div>
      )}
    </div>
  );
}
