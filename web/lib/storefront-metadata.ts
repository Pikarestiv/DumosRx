import type { Metadata } from "next";

import { WEB_APP_URL } from "@/lib/constants";
import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";
import { DEFAULT_STOREFRONT_LOCALE, translate, type StorefrontLocale } from "@/lib/storefront-i18n";
import { paymentMetaSentence, paymentWaysOf } from "@/lib/storefront-payment-ways";

export function storefrontUrl(store_slug: string): string {
  return `${WEB_APP_URL}/s/${store_slug}/`;
}

function storefrontDescription(store: StorefrontStore, locale: StorefrontLocale, storefront?: StorefrontProfile): string {
  const where = store.location || store.address;
  const pay = paymentMetaSentence(locale, paymentWaysOf(storefront, store));
  return where
    ? translate(locale, "meta.description.where", { name: store.name, where, pay })
    : translate(locale, "meta.description.plain", { name: store.name, pay });
}

export function buildStorefrontMetadata(
  store_slug: string,
  store?: StorefrontStore,
  locale: StorefrontLocale = DEFAULT_STOREFRONT_LOCALE,
  storefront?: StorefrontProfile,
): Metadata {
  const url = storefrontUrl(store_slug);

  if (!store) {
    return {
      title: { absolute: translate(locale, "meta.unavailable") },
      robots: { index: false, follow: false },
      alternates: { canonical: url },
    };
  }

  const description = storefrontDescription(store, locale, storefront);
  const title = translate(locale, "meta.title", { name: store.name });

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: store.name,
      title,
      description,
      images: store.logo_url ? [{ url: store.logo_url, alt: `${store.name} logo` }] : undefined,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export function buildStorefrontCheckoutMetadata(
  store_slug: string,
  store?: StorefrontStore,
  locale: StorefrontLocale = DEFAULT_STOREFRONT_LOCALE,
): Metadata {
  return {
    title: { absolute: store ? translate(locale, "meta.checkout", { name: store.name }) : translate(locale, "meta.checkout.plain") },
    description: store
      ? translate(locale, "meta.checkout.description", { name: store.name })
      : translate(locale, "meta.checkout.description.plain"),
    alternates: { canonical: `${storefrontUrl(store_slug)}checkout/` },
    robots: { index: false, follow: false },
  };
}
