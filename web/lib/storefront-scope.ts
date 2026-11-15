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

export function branchHref(scope: string, branch: { slug?: string; is_primary?: boolean }, page = ""): string {
  const { slug } = parseStorefrontScope(scope);
  const base = branch.slug && !branch.is_primary ? `/s/${slug}/${branch.slug}` : `/s/${slug}`;
  return page ? `${base}/${page}` : base;
}
