import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/base-client";
import { useCartStore } from "@/lib/store/use-cart-store";
import type { StorefrontProduct } from "@/lib/types/storefront";

interface CatalogResponse {
  products: StorefrontProduct[];
  online_payment_available?: boolean;
}

/**
 * Re-prices a storefront cart against the live catalog on mount: the server
 * prices an order from product_id + quantity, never from the cart's cached
 * prices. See docs/KNOWN_BUGS.md history for why a failure here has to be
 * surfaced rather than presented as confirmed pricing.
 */
export function useCartRepricing(storeSlug: string) {
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesStale, setPricesStale] = useState(false);
  const [onlinePaymentAvailable, setOnlinePaymentAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const repriceCart = async () => {
      const { carts, reconcilePrices } = useCartStore.getState();
      const items = carts[storeSlug] ?? [];
      if (items.length === 0) {
        if (!cancelled) setPricesLoading(false);
        return;
      }

      try {
        const { data } = await apiClient.get<CatalogResponse>(`/storefront/${storeSlug}`);
        if (cancelled) return;

        setOnlinePaymentAvailable(!!data.online_payment_available);

        const prices: Record<string, number> = {};
        for (const product of data.products ?? []) {
          prices[product.id] = parseFloat(String(product.selling_price));
        }

        const removed = items.filter((item) => prices[item.id] === undefined);
        const repriced = items.filter(
          (item) => prices[item.id] !== undefined && prices[item.id] !== item.price,
        );
        reconcilePrices(storeSlug, prices);

        if (removed.length > 0) {
          const names = removed.map((item) => item.name).join(", ");
          toast.error(
            `${names} ${removed.length === 1 ? "is" : "are"} no longer available online and ${removed.length === 1 ? "was" : "were"} removed from your cart. Ask the store if you still want ${removed.length === 1 ? "it" : "them"}.`,
            { duration: 10000 },
          );
        }
        if (repriced.length > 0) {
          toast.info(
            `The price of ${repriced.map((item) => item.name).join(", ")} changed. Your order summary has been updated.`,
          );
        }
      } catch {
        if (!cancelled) setPricesStale(true);
      } finally {
        if (!cancelled) setPricesLoading(false);
      }
    };

    void repriceCart();
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  return { pricesLoading, pricesStale, onlinePaymentAvailable };
}
