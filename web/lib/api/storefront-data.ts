import { DEMO_PAGINATED_PRODUCTS, DEMO_STOREFRONT_DATA } from "@/lib/api/storefront-demo-data";
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
}

export interface StorefrontBranch {
  id: string;
  name: string;
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
  store_slug: string,
  branchId?: string,
): Promise<StorefrontData | null> {
  if (process.env.STOREFRONT_ALLOW_EMPTY === "1" && store_slug === "demo") {
    return DEMO_STOREFRONT_DATA;
  }

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

  const queryStr = branchId ? `?branch=${encodeURIComponent(branchId)}` : "";

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/storefront/${store_slug}${queryStr}`);
  } catch (error) {
    throw new StorefrontFetchError(
      `Could not reach the API for /store/${store_slug}: ` +
        (error instanceof Error ? error.message : "network error"),
    );
  }

  if (res.status === 404 || res.status === 403) {
    return null;
  }

  if (!res.ok) {
    throw new StorefrontFetchError(
      `API returned HTTP ${res.status} for /store/${store_slug}.`,
    );
  }

  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new StorefrontFetchError(
      `API returned a non-JSON response for /store/${store_slug} ` +
        `(${res.headers.get("content-type") ?? "no content-type"}).`,
    );
  }

  try {
    return (await res.json()) as StorefrontData;
  } catch (error) {
    throw new StorefrontFetchError(
      `API returned unparseable JSON for /store/${store_slug}: ` +
        (error instanceof Error ? error.message : "parse error"),
    );
  }
}

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
  store_slug: string,
  options?: { page?: number; q?: string; category?: string; per_page?: number; branch?: string },
): Promise<PaginatedStorefrontProducts | null> {
  if (process.env.STOREFRONT_ALLOW_EMPTY === "1" && store_slug === "demo") {
    return DEMO_PAGINATED_PRODUCTS;
  }

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.q) params.set("q", options.q);
  if (options?.category) params.set("category", options.category);
  if (options?.per_page) params.set("per_page", String(options.per_page));
  if (options?.branch) params.set("branch", options.branch);

  const queryStr = params.toString() ? `?${params.toString()}` : "";

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/storefront/${store_slug}/products${queryStr}`);
  } catch (error) {
    throw new StorefrontFetchError(
      `Could not reach the API for /store/${store_slug}/products: ` +
        (error instanceof Error ? error.message : "network error"),
    );
  }

  if (res.status === 404 || res.status === 403) {
    return null;
  }

  if (!res.ok) {
    throw new StorefrontFetchError(
      `API returned HTTP ${res.status} for /store/${store_slug}/products.`,
    );
  }

  try {
    return (await res.json()) as PaginatedStorefrontProducts;
  } catch (error) {
    throw new StorefrontFetchError(
      `API returned unparseable JSON for /store/${store_slug}/products: ` +
        (error instanceof Error ? error.message : "parse error"),
    );
  }
}
