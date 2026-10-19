"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Refetches every query this panel holds. An installed admin PWA has no
 * pull-to-refresh and no address bar, so on a phone this was the only way to
 * get fresh figures — see web/AGENTS.md.
 */
export function AdminHeaderRefresh() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Own state rather than useIsFetching(): a background poll would otherwise
  // leave this spinning with nothing to do with the operator's click.
  const refresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Refresh data"
      title="Refresh data"
      disabled={isRefreshing}
      onClick={() => void refresh()}
    >
      <RefreshCw
        className={cn(
          "h-5 w-5 text-slate-500 dark:text-slate-400",
          isRefreshing && "animate-spin",
        )}
      />
    </Button>
  );
}
