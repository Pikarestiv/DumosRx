import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import { getLastSyncTime } from "@/lib/storage-keys";
import {
  COUNT_STALE_AFTER_MINUTES,
  isCountBaselineStale,
  minutesSince,
} from "@/lib/utils/count-freshness";

export interface StalePeerDevice {
  deviceLabel: string | null;
  minutesBehind: number | null;
}

export interface CountFreshness {
  localMinutes: number | null;
  isLocalStale: boolean;
  stalePeers: StalePeerDevice[];
  thresholdMinutes: number;
  shouldWarn: boolean;
}

export function useCountFreshness(): CountFreshness {
  const lastSync = getLastSyncTime();

  const { data } = useQuery({
    ...queryKeys.sync.peerFreshness(),
    queryFn: () => apiClient.getPeerSyncFreshness(),
    retry: false,
    staleTime: 60_000,
  });

  const stalePeers = (data?.stale_devices ?? []).map((device) => ({
    deviceLabel: device.device_label,
    minutesBehind: device.minutes_behind,
  }));

  const isLocalStale = isCountBaselineStale(lastSync);

  return {
    localMinutes: minutesSince(lastSync),
    isLocalStale,
    stalePeers,
    thresholdMinutes: data?.threshold_minutes ?? COUNT_STALE_AFTER_MINUTES,
    shouldWarn: isLocalStale || stalePeers.length > 0,
  };
}
