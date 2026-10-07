"use client";

import { Button } from "@/components/ui/button";
import { activityTypeLabel } from "@/lib/api/admin-hooks-activity-feed";
import type { ActivityFeedType } from "@/lib/types/admin";

interface ActivityFeedFiltersProps {
  available: ActivityFeedType[];
  active: ActivityFeedType | null;
  onChange: (type: ActivityFeedType | null) => void;
}

export function ActivityFeedFilters({ available, active, onChange }: ActivityFeedFiltersProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant={active === null ? "default" : "outline"}
        size="sm"
        onClick={() => onChange(null)}
      >
        All
      </Button>

      {available.map((type) => (
        <Button
          key={type}
          variant={active === type ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(type)}
        >
          {activityTypeLabel(type)}
        </Button>
      ))}
    </div>
  );
}
