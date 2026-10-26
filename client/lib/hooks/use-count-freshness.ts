import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import { getBatchDeficits } from "@/lib/db/batch-quantity";
import { useOutstandingBackorders } from "@/lib/hooks/use-outstanding-backorders";
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

export interface OwedProduct {
  productName: string;
  owed: number;
}

export interface CountFreshness {
  localMinutes: number | null;
  isLocalStale: boolean;
  stalePeers: StalePeerDevice[];
  thresholdMinutes: number;
  /** Products whose ledger is short, so a count of what is on the shelf pays
   * the shortfall off before it adds anything (A-265). */
  deficits: ProductDeficit[];
  /** Units sold before stock was received: counting before the receipt counts the delivery twice. */
  owed: OwedProduct[];
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

  // Only asserted against a complete movement log:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-count-freshness-ts-L49
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

  const owed = useOutstandingBackorders().map((o) => ({ productName: o.productName, owed: o.outstanding }));

  const isLocalStale = isCountBaselineStale(lastSync);

  return {
    localMinutes: minutesSince(lastSync),
    isLocalStale,
    stalePeers,
    thresholdMinutes: data?.threshold_minutes ?? COUNT_STALE_AFTER_MINUTES,
    deficits,
    owed,
    shouldWarn: isLocalStale || stalePeers.length > 0 || deficits.length > 0 || owed.length > 0,
  };
}
