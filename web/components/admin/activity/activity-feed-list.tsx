"use client";

import { Badge } from "@/components/ui/badge";
import { Activity, CreditCard, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { activityTypeLabel } from "@/lib/api/admin-hooks-activity-feed";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import type { ActivityFeedEvent, ActivityFeedType } from "@/lib/types/admin";

const ICON_CLASS = "h-4 w-4 text-muted-foreground shrink-0";

/**
 * A switch rather than a lookup that returns a component reference: deriving
 * the element type during render resets its state on every render, and §8
 * forbids bracket lookup on an input-derived key regardless.
 */
function EventIcon({ type }: { type: ActivityFeedType }) {
  switch (type) {
    case "admin_action":
      return <Wrench className={ICON_CLASS} />;
    case "sync_failure":
      return <RefreshCw className={ICON_CLASS} />;
    case "subscription":
      return <ShieldCheck className={ICON_CLASS} />;
    case "payment":
      return <CreditCard className={ICON_CLASS} />;
    default:
      return <Activity className={ICON_CLASS} />;
  }
}

function timeOf(at: string): string {
  const parsed = new Date(at);

  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

interface ActivityFeedListProps {
  events: ActivityFeedEvent[];
  isLoading: boolean;
  isError?: boolean;
}

export function ActivityFeedList({ events, isLoading, isError }: ActivityFeedListProps) {
  if (isError) {
    return (
      <p className="text-sm font-medium text-muted-foreground p-6">
        Activity is unavailable right now.
      </p>
    );
  }

  if (isLoading && events.length === 0) {
    return <p className="text-sm text-muted-foreground p-6">Loading activity…</p>;
  }

  if (events.length === 0) {
    return (
      <p className="text-sm font-medium text-muted-foreground p-6">
        No activity in this view yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-3 px-4 py-3">
          <EventIcon type={event.type} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-sm text-foreground">{event.title}</p>
              <Badge variant="outline" className="text-xs">
                {activityTypeLabel(event.type)}
              </Badge>
              {event.derived && (
                <Badge variant="secondary" className="text-xs" title="Inferred from subscription dates, not a recorded event">
                  Derived
                </Badge>
              )}
            </div>
            {event.detail && (
              <p className="text-sm text-muted-foreground mt-0.5 break-words">{event.detail}</p>
            )}
          </div>

          <div className="text-right shrink-0">
            <p className="text-xs font-medium text-foreground">{formatDateToDDMMYYYY(event.at)}</p>
            <p className="text-xs text-muted-foreground">{timeOf(event.at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
