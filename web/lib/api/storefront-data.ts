import type { StorefrontProduct } from "@/lib/types/storefront";

export interface StorefrontStore {
  id: string;
  name: string;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
}

export interface StorefrontData {
  store: StorefrontStore;
  products: StorefrontProduct[];
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
): Promise<StorefrontData | null> {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/storefront/${store_slug}`);
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
