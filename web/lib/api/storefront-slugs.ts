/**
 * Build-time-only helper for the two `[store_slug]` static routes
 * (storefront + checkout). `web/` is a static export (`output: "export"`),
 * so `generateStaticParams` can only ever render the exact slugs returned
 * here: there's no server to render an arbitrary store_slug at request
 * time.
 *
 * A failure to reach the API is fatal rather than degraded — see
 * `web/AGENTS.md`'s storefront section and `docs/STOREFRONT_REVIEW.md`
 * (SF-P0-1) for why. `STOREFRONT_ALLOW_EMPTY=1` opts back into the single
 * `demo` placeholder for offline/sandbox builds.
 */
const DEMO_FALLBACK = [{ store_slug: "demo" }];

function allowEmpty(): boolean {
  return process.env.STOREFRONT_ALLOW_EMPTY === "1";
}

function failOrFallback(reason: string): { store_slug: string }[] {
  if (allowEmpty()) {
    return DEMO_FALLBACK;
  }
  throw new Error(
    `Could not fetch the storefront slug list (${reason}). Refusing to build a ` +
      `storefront-less site: the deploy's FTP sync would then delete every live ` +
      `/s/<slug>/ directory from production. Set STOREFRONT_ALLOW_EMPTY=1 to ` +
      `build the demo placeholder only (offline/sandbox work).`,
  );
}

export async function getStorefrontSlugs(): Promise<{ store_slug: string }[]> {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
  let res: Response;
  try {
    res = await fetch(`${apiUrl}/storefront-slugs`);
  } catch (error) {
    return failOrFallback(
      error instanceof Error ? error.message : "network error",
    );
  }

  if (!res.ok) {
    return failOrFallback(`HTTP ${res.status}`);
  }
  if (!res.headers.get("content-type")?.includes("application/json")) {
    return failOrFallback(
      `non-JSON response (${res.headers.get("content-type") ?? "no content-type"})`,
    );
  }

  let slugs: string[] | undefined;
  try {
    ({ slugs } = (await res.json()) as { slugs: string[] });
  } catch (error) {
    return failOrFallback(
      error instanceof Error ? error.message : "unparseable JSON",
    );
  }

  // An empty list is a legitimate answer (no store has an online store yet),
  // not a failure — a dynamic route still needs at least one entry, and a
  // demo-only sync has nothing real to delete in that state.
  if (!slugs?.length) return DEMO_FALLBACK;
  return slugs.map((store_slug) => ({ store_slug }));
}

export const NO_BRANCH_PLACEHOLDER = "_none";

/**
 * Build-time pairs for the `[store_slug]/[branch]` routes. `output: export`
 * refuses an empty list, so a build with no multi-branch storefront emits one
 * placeholder pair that the route turns into a 404 (the demo pair in sandbox
 * builds, so branch pages can be reviewed locally).
 */
export async function getStorefrontBranchParams(): Promise<{ store_slug: string; branch: string }[]> {
  if (allowEmpty()) return [{ store_slug: "demo", branch: "demo" }];
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
  const res = await fetch(`${apiUrl}/storefront-slugs`);
  const { branches } = res.ok ? ((await res.json()) as { branches?: Record<string, string[]> }) : { branches: undefined };
  const pairs = Object.entries(branches ?? {}).flatMap(([store_slug, slugs]) => slugs.map((branch) => ({ store_slug, branch })));
  return pairs.length > 0 ? pairs : [{ store_slug: NO_BRANCH_PLACEHOLDER, branch: NO_BRANCH_PLACEHOLDER }];
}
