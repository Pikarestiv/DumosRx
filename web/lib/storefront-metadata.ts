import type { Metadata } from "next";

import { WEB_APP_URL } from "@/lib/constants";
import type { StorefrontStore } from "@/lib/api/storefront-data";

export function storefrontUrl(store_slug: string): string {
  return `${WEB_APP_URL}/store/${store_slug}/`;
}

function storefrontDescription(store: StorefrontStore): string {
  const where = store.location || store.address;
  return where
    ? `Browse and order from ${store.name} in ${where}. Pay online, by transfer, or in store.`
    : `Browse and order from ${store.name}. Pay online, by transfer, or in store.`;
}

/**
 * Per-store metadata for the two `[store_slug]` routes. Without this every
 * storefront inherited the root layout's DumosRx marketing metadata, so a
 * store's link previewed as DumosRx rather than as the store — see
 * `docs/STOREFRONT_REVIEW.md` feature #12. `title.absolute` bypasses the root
 * layout's `"%s | DumosRx"` template: the store's own name is the title.
 */
export function buildStorefrontMetadata(
  store_slug: string,
  store?: StorefrontStore,
): Metadata {
  const url = storefrontUrl(store_slug);

  if (!store) {
    return {
      title: { absolute: "Store unavailable" },
      robots: { index: false, follow: false },
      alternates: { canonical: url },
    };
  }

  const description = storefrontDescription(store);

  return {
    title: { absolute: `${store.name} — Order Online` },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: store.name,
      title: `${store.name} — Order Online`,
      description,
      images: store.logo_url ? [{ url: store.logo_url, alt: `${store.name} logo` }] : undefined,
    },
    twitter: {
      card: "summary",
      title: `${store.name} — Order Online`,
      description,
    },
  };
}

export function buildStorefrontCheckoutMetadata(
  store_slug: string,
  store?: StorefrontStore,
): Metadata {
  return {
    title: { absolute: store ? `Checkout — ${store.name}` : "Checkout" },
    description: store
      ? `Complete your order from ${store.name}.`
      : "Complete your order.",
    alternates: { canonical: `${storefrontUrl(store_slug)}checkout/` },
    robots: { index: false, follow: false },
  };
}
