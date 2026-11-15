export const RESERVED_BRANCH_SEGMENTS: readonly string[] = [
  "catalog",
  "checkout",
  "order",
  "about",
  "faq",
  "locations",
  "track",
  "prescription",
  "p",
];

export interface StorefrontScope {
  slug: string;
  branch?: string;
}

export const storefrontScope = (slug: string, branch?: string | null): string =>
  branch ? `${slug}/${branch}` : slug;

export function parseStorefrontScope(scope: string): StorefrontScope {
  const [slug, branch] = scope.split("/");
  return branch ? { slug, branch } : { slug };
}

export function scopeFromPathname(pathname: string | null | undefined): string | null {
  const [, root, slug, second] = (pathname ?? "").split("/");
  if (root !== "s" || !slug) return null;
  return storefrontScope(slug, second && !RESERVED_BRANCH_SEGMENTS.includes(second) ? second : undefined);
}

const BRANCH_PAGES: readonly string[] = ["catalog", "checkout", "order"];

export function branchHref(scope: string, branch: { slug?: string; is_primary?: boolean }, page = ""): string {
  const { slug } = parseStorefrontScope(scope);
  const base = branch.slug ? `/s/${slug}/${branch.slug}` : `/s/${slug}`;
  return page ? `${base}/${page}` : base;
}

export function pageOfPathname(pathname: string | null | undefined): string {
  const last = (pathname ?? "").split("/").filter(Boolean).pop() ?? "";
  return BRANCH_PAGES.includes(last) ? last : "";
}

/** Where a brand-level URL of a multi-branch storefront should land: the main branch's page, or null if it already is one. */
export function canonicalBranchPath(pathname: string, slug: string, primaryBranch: string): string | null {
  const [root, brand, second, ...rest] = pathname.split("/").filter(Boolean);
  if (root !== "s" || brand !== slug) return null;
  if (second && !BRANCH_PAGES.includes(second)) return null;

  const tail = [second, ...rest].filter(Boolean).join("/");
  return `/s/${slug}/${primaryBranch}${tail ? `/${tail}` : ""}${pathname.endsWith("/") ? "/" : ""}`;
}
