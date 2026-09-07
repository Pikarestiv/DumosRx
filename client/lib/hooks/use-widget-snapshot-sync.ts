import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/lib/context/auth-context";
import { writeWidgetSnapshot } from "@/lib/native/widget-bridge";
import { buildWidgetSnapshotPayload } from "@/lib/utils/widget-snapshot";

/**
 * Keeps the Android widget's local data snapshot fresh whenever the app is
 * open: fetches /dashboard/widget-snapshot and writes the result to native
 * storage. Mounted once near the app root (see use-widget-deeplink.ts for
 * the sibling hook it's wired alongside). The WorkManager background job
 * (RefreshWorker, native) covers refreshes while the app isn't open.
 */
export function useWidgetSnapshotSync() {
  const { isCloudLinked } = useAuth();

  const { data, dataUpdatedAt } = useQuery({
    ...queryKeys.fleet.widgetSnapshot(),
    queryFn: () => apiClient.getWidgetSnapshot(),
    enabled: isCloudLinked,
  });

  useEffect(() => {
    // While cloud-linked, wait for the first successful fetch before writing
    // so we don't clobber native storage with a transient "unlinked" state
    // during the initial load.
    if (isCloudLinked && data === undefined) return;

    const payload = buildWidgetSnapshotPayload(data ?? null, isCloudLinked, Date.now());
    void writeWidgetSnapshot(JSON.stringify(payload));
    // dataUpdatedAt changes on every successful refetch even if `data` is
    // referentially different each time, which is what should retrigger this.
  }, [data, isCloudLinked, dataUpdatedAt]);
}
