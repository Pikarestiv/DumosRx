import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { apiClient } from "@/lib/api/base-client";
import { useCartStore } from "@/lib/store/use-cart-store";
import type { StorefrontProduct } from "@/lib/types/storefront";

const MAX_REPRICED_ITEMS = 100;

interface CatalogResponse {
  data: StorefrontProduct[];
  store?: { currency?: string | null; online_payment_available?: boolean };
}

/**
 * Re-prices a storefront cart against the live catalog on mount: the server
 * prices an order from product_id + quantity, never from the cart's cached
 * prices. See docs/KNOWN_BUGS.md history for why a failure here has to be
 * surfaced rather than presented as confirmed pricing.
 */
export function useCartRepricing(storeSlug: string) {
  const i18n = useStorefrontI18n();
  const latestI18n = useRef(i18n);
  useEffect(() => {
    latestI18n.current = i18n;
  }, [i18n]);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesStale, setPricesStale] = useState(false);
  const [onlinePaymentAvailable, setOnlinePaymentAvailable] = useState(false);
  const [currency, setCurrency] = useState<string | null>(null);

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
        const asked = items.slice(0, MAX_REPRICED_ITEMS);
        const { data } = await apiClient.get<CatalogResponse>(`/storefront/${storeSlug}/products`, {
          params: { ids: asked.map((item) => item.id).join(","), per_page: MAX_REPRICED_ITEMS },
        });
        if (cancelled) return;

        const askedIds = new Set(asked.map((item) => item.id));
        if ((data.data ?? []).some((product) => !askedIds.has(product.id))) {
          setPricesStale(true);
          return;
        }

        setOnlinePaymentAvailable(!!data.store?.online_payment_available);
        setCurrency(data.store?.currency ?? null);

        const prices: Record<string, number> = {};
        for (const product of data.data ?? []) {
          prices[product.id] = parseFloat(String(product.selling_price));
        }
        for (const item of items.slice(MAX_REPRICED_ITEMS)) prices[item.id] = item.price;

        const removed = items.filter((item) => prices[item.id] === undefined);
        const repriced = items.filter(
          (item) => prices[item.id] !== undefined && prices[item.id] !== item.price,
        );
        reconcilePrices(storeSlug, prices);

        const { t } = latestI18n.current;
        if (removed.length > 0) {
          const names = removed.map((item) => item.name).join(", ");
          toast.error(t(removed.length === 1 ? "cart.removed.one" : "cart.removed.other", { names }), { duration: 10000 });
        }
        if (repriced.length > 0) {
          toast.info(t("cart.repriced", { names: repriced.map((item) => item.name).join(", ") }));
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

  return { pricesLoading, pricesStale, onlinePaymentAvailable, currency };
}
