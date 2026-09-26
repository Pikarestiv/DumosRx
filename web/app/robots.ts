import type { MetadataRoute } from "next";

import { WEB_APP_URL } from "@/lib/constants";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/dashboard/"],
      },
    ],
    sitemap: `${WEB_APP_URL}/sitemap.xml`,
  };
}
