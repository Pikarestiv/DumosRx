"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminActivityFeed } from "@/lib/api/admin-hooks-activity-feed";
import type { ActivityFeedType } from "@/lib/types/admin";
import { ActivityFeedFilters } from "./activity-feed-filters";
import { ActivityFeedList } from "./activity-feed-list";

export function ActivityFeedPanel() {
  const [type, setType] = useState<ActivityFeedType | null>(null);
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAdminActivityFeed(type);

  const pages = data?.pages ?? [];
  const events = pages.flatMap((page) => page.events);
  const fetched = pages[0]?.available_types;

  // Held across fetches: the key changes on every filter click, so reading
  // these straight from `data` unmounted the button the operator just
  // pressed until the response landed.
  const [available, setAvailable] = useState<ActivityFeedType[]>([]);

  useEffect(() => {
    if (fetched) {
      setAvailable(fetched);
    }
  }, [fetched]);

  return (
    <div>
      <div className="p-4 border-b border-border">
        <ActivityFeedFilters available={available} active={type} onChange={setType} />
      </div>

      <ActivityFeedList events={events} isLoading={isLoading} isError={isError} />

      {hasNextPage && (
        <div className="p-4 border-t border-border">
          <Button
            variant="outline"
            className="border-2 font-bold"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
