import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/context/store-context";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { countListedProducts } from "@/lib/db/queries/product-visibility";
import { queryKeys } from "@/lib/query-keys";
import { listingCapState, type ListingCapState } from "@/lib/utils/storefront-entitlements";

/** The active store's online listing cap, counted from the local database; the server enforces the same cap on sync. */
export function useOnlineListingCap(): ListingCapState {
  const { storeProfile } = useStore();
  const { storefrontEntitlements } = useFeatureGate();
  const cap = storefrontEntitlements?.storefront_enabled ? storefrontEntitlements.max_online_products : null;
  const storefrontOn = storeProfile?.online_store_enabled === 1;

  const { data: listed = 0 } = useQuery({
    ...queryKeys.products.onlineListedCount(),
    queryFn: countListedProducts,
    enabled: cap !== null && storefrontOn,
  });

  return listingCapState(cap ?? null, storefrontOn, listed);
}
