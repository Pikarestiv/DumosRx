import type { Metadata } from "next";

import { LegacyStoreRedirect } from "@/components/storefront/legacy-store-redirect";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { LEGACY_STORE_PAGES } from "@/lib/storefront-legacy-path";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export async function generateStaticParams() {
  const slugs = await getStorefrontSlugs();
  return slugs.flatMap(({ store_slug }) => LEGACY_STORE_PAGES.map((rest) => ({ store_slug, rest: [...rest] })));
}

export default function LegacyStorePage() {
  return <LegacyStoreRedirect />;
}
