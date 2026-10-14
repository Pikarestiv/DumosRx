import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import { getBatchDeficits } from "@/lib/db/batch-quantity";
import { movementLogIsComplete } from "@/lib/db/sync-engine/stock-auto-heal";
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

export interface ProductDeficit {
  productName: string;
  deficit: number;
}

export interface CountFreshness {
  localMinutes: number | null;
  isLocalStale: boolean;
  stalePeers: StalePeerDevice[];
  thresholdMinutes: number;
  /** Products whose ledger is short, so a count of what is on the shelf pays
   * the shortfall off before it adds anything (A-265). */
  deficits: ProductDeficit[];
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

  // Only asserted against a complete movement log: a device still catching up
  // can read a deficit that the movements it has not pulled yet would explain,
  // which is the same freshness condition the count warning itself exists for.
  const { data: deficitRows } = useQuery({
    ...queryKeys.stockBatches.batchDeficits(),
    queryFn: async () => ((await movementLogIsComplete()) ? getBatchDeficits() : []),
    staleTime: 60_000,
  });

  const byProduct = new Map<string, number>();
  for (const row of deficitRows ?? []) {
    byProduct.set(row.productName, (byProduct.get(row.productName) ?? 0) + row.deficit);
  }
  const deficits = [...byProduct.entries()]
    .map(([productName, deficit]) => ({ productName, deficit }))
    .sort((a, b) => b.deficit - a.deficit);

  const isLocalStale = isCountBaselineStale(lastSync);

  return {
    localMinutes: minutesSince(lastSync),
    isLocalStale,
    stalePeers,
    thresholdMinutes: data?.threshold_minutes ?? COUNT_STALE_AFTER_MINUTES,
    deficits,
    shouldWarn: isLocalStale || stalePeers.length > 0 || deficits.length > 0,
  };
}
