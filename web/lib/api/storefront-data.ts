import { DEMO_STOREFRONT_DATA, demoCatalog } from "@/lib/api/storefront-demo-data";
import { parseStorefrontScope } from "@/lib/storefront-scope";
import type { StorefrontProduct } from "@/lib/types/storefront";

export interface StorefrontStore {
  id: string;
  name: string;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  currency?: string | null;
  is_primary?: boolean;
  store_type?: string | null;
  online_payment_available?: boolean;
  timezone?: string | null;
}

export interface StorefrontBranch {
  id: string;
  name: string;
  slug?: string;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  is_primary?: boolean;
}

export interface StorefrontProfile {
  id: string;
  slug: string;
  name: string;
  headline?: string | null;
  about?: string | null;
  theme?: string;
  locale?: string | null;
  enabled_locales?: string[] | null;
  accent?: string | null;
  tagline?: string | null;
  whatsapp?: string | null;
  pickup_minutes?: number | null;
  payment_instructions?: string | null;
  delivery_available?: boolean;
  delivery_note?: string | null;
  pay_on_delivery?: boolean;
  show_services?: boolean;
  opening_hours?: Record<string, { open: string; close: string } | null> | null;
  logo_url?: string | null;
  banner_url?: string | null;
}

export interface StorefrontData {
  store: StorefrontStore;
  storefront?: StorefrontProfile;
  branches?: StorefrontBranch[];
  selected_branch?: StorefrontStore;
  products: StorefrontProduct[];
  product_count?: number;
  online_payment_available?: boolean;
}

/**
 * Thrown for any failure that is NOT the API authoritatively saying this
 * storefront isn't public (404/403). Left uncaught on purpose: it fails the
 * static export for that page, so the last good deploy stays live instead of
 * being overwritten with a rendered 404 page — see `docs/STOREFRONT_REVIEW.md`
 * (SF-P1-1).
 */
export class StorefrontFetchError extends Error {}

/**
 * Build-time fetch of one storefront. `null` means "this store is genuinely
 * not published" (gone, suspended, plan lapsed) and the caller should
 * `notFound()`; anything else throws.
 */
export async function getStorefrontData(
  scope: string,
  branchId?: string,
): Promise<StorefrontData | null> {
  const { slug: store_slug, branch: scopedBranch } = parseStorefrontScope(scope);
  const branchParam = branchId ?? scopedBranch;
  if ((process.env.STOREFRONT_ALLOW_EMPTY === "1" || process.env.NEXT_PUBLIC_STOREFRONT_SANDBOX === "1") && store_slug === "demo") {
    return DEMO_STOREFRONT_DATA;
  }

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

  const queryStr = branchParam ? `?branch=${encodeURIComponent(branchParam)}` : "";

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/storefront/${store_slug}${queryStr}`);
  } catch (error) {
    throw new StorefrontFetchError(
      `Could not reach the API for /s/${store_slug}: ` +
        (error instanceof Error ? error.message : "network error"),
    );
  }

  if (res.status === 404 || res.status === 403) {
    return null;
  }

  if (!res.ok) {
    throw new StorefrontFetchError(
      `API returned HTTP ${res.status} for /s/${store_slug}.`,
    );
  }

  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new StorefrontFetchError(
      `API returned a non-JSON response for /s/${store_slug} ` +
        `(${res.headers.get("content-type") ?? "no content-type"}).`,
    );
  }

  try {
    return (await res.json()) as StorefrontData;
  } catch (error) {
    throw new StorefrontFetchError(
      `API returned unparseable JSON for /s/${store_slug}: ` +
        (error instanceof Error ? error.message : "parse error"),
    );
  }
}

const PRODUCTS_REQUEST_TIMEOUT_MS = 15_000;

export interface StorefrontCategory {
  id: string;
  name: string;
  count: number;
}

export interface PaginatedStorefrontProducts {
  data: StorefrontProduct[];
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    path: string;
    per_page: number;
    to: number | null;
    total: number;
  };
  categories?: StorefrontCategory[];
  store?: { id: string; name: string; currency?: string | null };
}

export async function getStorefrontProducts(
  scope: string,
  options?: { page?: number; q?: string; category?: string; per_page?: number; branch?: string; ids?: string[] },
): Promise<PaginatedStorefrontProducts | null> {
  const { slug: store_slug, branch: scopedBranch } = parseStorefrontScope(scope);
  const branch = options?.branch ?? scopedBranch;
  if (process.env.NEXT_PUBLIC_STOREFRONT_SANDBOX === "1" && store_slug === "demo") {
    return demoCatalog(options);
  }

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.q) params.set("q", options.q);
  if (options?.category) params.set("category", options.category);
  if (options?.per_page) params.set("per_page", String(options.per_page));
  if (branch) params.set("branch", branch);
  if (options?.ids?.length) params.set("ids", options.ids.join(","));

  const queryStr = params.toString() ? `?${params.toString()}` : "";

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/storefront/${store_slug}/products${queryStr}`, {
      signal: AbortSignal.timeout(PRODUCTS_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new StorefrontFetchError(
      `Could not reach the API for /s/${store_slug}/products: ` +
        (error instanceof Error ? error.message : "network error"),
    );
  }

  if (res.status === 404 || res.status === 403) {
    return null;
  }

  if (!res.ok) {
    throw new StorefrontFetchError(
      `API returned HTTP ${res.status} for /s/${store_slug}/products.`,
    );
  }

  try {
    return (await res.json()) as PaginatedStorefrontProducts;
  } catch (error) {
    throw new StorefrontFetchError(
      `API returned unparseable JSON for /s/${store_slug}/products: ` +
        (error instanceof Error ? error.message : "parse error"),
    );
  }
}
