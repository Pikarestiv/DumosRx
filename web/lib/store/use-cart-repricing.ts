import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { apiClient } from "@/lib/api/base-client";
import { parseStorefrontScope } from "@/lib/storefront-scope";
import { useCartStore } from "@/lib/store/use-cart-store";
import { isServiceLine } from "@/lib/storefront-cart-lines";
import type { StorefrontService } from "@/lib/api/storefront-services";
import type { StorefrontProduct } from "@/lib/types/storefront";

const MAX_REPRICED_ITEMS = 100;

interface CatalogResponse {
  data: StorefrontProduct[];
  store?: { currency?: string | null; online_payment_available?: boolean };
}

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
        const { slug, branch } = parseStorefrontScope(storeSlug);
        const { data } = await apiClient.get<CatalogResponse>(`/storefront/${slug}/products`, {
          params: { ids: asked.map((item) => item.id).join(","), per_page: MAX_REPRICED_ITEMS, ...(branch ? { branch } : {}) },
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
        if (items.some(isServiceLine)) {
          const { data: services } = await apiClient.get<{ data?: StorefrontService[] }>(`/storefront/${slug}/services`, {
            params: branch ? { branch } : {},
          });
          if (cancelled) return;
          const booked = new Set(items.filter(isServiceLine).map((item) => item.id));
          for (const service of services.data ?? []) {
            if (booked.has(service.id)) prices[service.id] = Number(service.price);
          }
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
