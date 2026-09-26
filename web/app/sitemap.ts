import type { MetadataRoute } from "next";

import { WEB_APP_URL } from "@/lib/constants";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { storefrontUrl } from "@/lib/storefront-metadata";

export const dynamic = "force-static";

const MARKETING_PATHS = [
  "/",
  "/faq/",
  "/support/",
  "/downloads/",
  "/terms/",
  "/privacy/",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getStorefrontSlugs();
  const lastModified = new Date();

  return [
    ...MARKETING_PATHS.map((path) => ({
      url: `${WEB_APP_URL}${path}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1 : 0.6,
    })),
    ...slugs.map(({ store_slug }) => ({
      url: storefrontUrl(store_slug),
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
