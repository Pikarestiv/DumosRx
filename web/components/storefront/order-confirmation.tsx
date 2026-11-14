"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { apiClient } from "@/lib/api/base-client";
import { toDisplayTitle } from "@/lib/storefront-display";
import { whatsappLink } from "@/lib/storefront-product";
import { DISPLAY_FONT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/storefront-styles";
import { readSavedCheckoutDetails } from "@/lib/use-saved-checkout-details";

interface TrackedOrder {
  id: string;
  code: string;
  order_status: "pending" | "fulfilled" | "cancelled";
  payment_status: string;
  payment_method: "paystack" | "transfer" | "in_store";
  fulfilment_method: "pickup" | "delivery";
  payment_instructions: string | null;
  total_amount: string | number;
  currency: string;
  branch_name: string;
  store_phone: string | null;
  whatsapp: string | null;
  items: { product_name: string; quantity: number }[];
}

const subscribeToLocation = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};

type LoadState = { status: "loading" } | { status: "missing" } | { status: "ready"; order: TrackedOrder };

export function OrderConfirmation({ storeSlug }: { storeSlug: string }) {
  const { t, money } = useStorefrontI18n();
  const search = useSyncExternalStore(subscribeToLocation, () => window.location.search, () => "");
  const orderId = new URLSearchParams(search).get("id");
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    apiClient
      .get<{ order: TrackedOrder }>(`/storefront/${storeSlug}/orders/${encodeURIComponent(orderId)}`)
      .then(({ data }) => !cancelled && setState({ status: "ready", order: data.order }))
      .catch(() => !cancelled && setState({ status: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [storeSlug, orderId]);

  const noOrderInLink = search !== "" && !orderId;

  if (state.status === "loading" && !noOrderInLink) return <p className="py-12 text-center opacity-75">{t("order.loading")}</p>;

  if (noOrderInLink || state.status === "missing") {
    return (
      <div className="space-y-4 py-12 text-center">
        <p>{t("order.notFound")}</p>
        <Link href={`/store/${storeSlug}`} className={SECONDARY_BUTTON}>
          {t("order.backToStore")}
        </Link>
      </div>
    );
  }

  if (state.status !== "ready") return null;
  const { order } = state;
  const total = money(Number(order.total_amount), order.currency);
  const items = order.items.map((item) => `${item.quantity} x ${toDisplayTitle(item.product_name)}`).join(", ");
  const customerName = readSavedCheckoutDetails().customer_name;
  const message = t("order.whatsappMessage", { store: order.branch_name, code: order.code, items, total });
  const whatsapp = whatsappLink(order.whatsapp, customerName ? `${message} (${customerName})` : message);
  const payment =
    order.payment_method === "paystack"
      ? t("order.payment.paid")
      : order.payment_method === "transfer"
        ? t("order.payment.transfer")
        : t(order.fulfilment_method === "delivery" ? "order.payment.inStore.delivery" : "order.payment.inStore.pickup");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className={`${DISPLAY_FONT} text-3xl sm:text-4xl`}>{t("order.title")}</h1>
        <p className="text-lg">
          {t("order.code")}: <span className="font-semibold [font-family:var(--sf-font-price)]">{order.code}</span>
        </p>
        <p className="opacity-80">{t(`order.status.${order.order_status}`)}</p>
      </div>

      <section aria-label={t("order.items")} className="space-y-3 rounded-[var(--sf-card-radius)] border border-black/10 bg-white p-5">
        <h2 className="font-semibold">{t("order.items")}</h2>
        <ul className="space-y-1 text-sm">
          {order.items.map((item, index) => (
            <li key={`${item.product_name}-${index}`}>
              {item.quantity} × {toDisplayTitle(item.product_name)}
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t border-black/10 pt-3 font-semibold">
          <span>{t("order.total")}</span>
          <span className="[font-family:var(--sf-font-price)]">{total}</span>
        </p>
        <p className="text-sm">{t(order.fulfilment_method === "delivery" ? "order.fulfilment.delivery" : "order.fulfilment.pickup")}</p>
        <p className="text-sm">{payment}</p>
      </section>

      {order.payment_method === "transfer" && order.payment_instructions ? (
        <section className="space-y-2 rounded-[var(--sf-card-radius)] border border-black/10 bg-white p-5">
          <h2 className="font-semibold">{t("checkout.instructions.heading")}</h2>
          <p className="whitespace-pre-line text-sm">{order.payment_instructions}</p>
        </section>
      ) : null}

      <div className="space-y-3 text-sm">
        <p>{t("order.next")}</p>
        <p className="opacity-80">{t("order.emailNote")}</p>
        {order.store_phone ? <p>{t("order.contact", { store: order.branch_name, phone: order.store_phone })}</p> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={PRIMARY_BUTTON}>
            {t("order.whatsapp")}
          </a>
        ) : null}
        <Link href={`/store/${storeSlug}`} className={SECONDARY_BUTTON}>
          {t("order.backToStore")}
        </Link>
      </div>
    </div>
  );
}
