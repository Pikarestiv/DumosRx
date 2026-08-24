/**
 * Build-time-only helper for the two `[store_slug]` static routes
 * (storefront + checkout). `web/` is a static export (`output: "export"`),
 * so `generateStaticParams` can only ever render the exact slugs returned
 * here: there's no server to render an arbitrary store_slug at request
 * time. Falls back to the "demo" placeholder (a valid dynamic route needs
 * at least one entry) if the fetch fails or no store has an online store
 * enabled yet.
 */
export async function getStorefrontSlugs(): Promise<{ store_slug: string }[]> {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
  try {
    const res = await fetch(`${apiUrl}/storefront-slugs`);
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) {
      return [{ store_slug: "demo" }];
    }
    const { slugs } = (await res.json()) as { slugs: string[] };
    if (!slugs?.length) return [{ store_slug: "demo" }];
    return slugs.map((store_slug) => ({ store_slug }));
  } catch {
    return [{ store_slug: "demo" }];
  }
}
