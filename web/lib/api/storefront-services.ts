import { parseStorefrontScope } from "@/lib/storefront-scope";

export interface StorefrontService {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
}

const SERVICES_REQUEST_TIMEOUT_MS = 15_000;

export async function getStorefrontServices(scope: string): Promise<StorefrontService[]> {
  const { slug, branch } = parseStorefrontScope(scope);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
  const res = await fetch(`${apiUrl}/storefront/${slug}/services${branch ? `?branch=${encodeURIComponent(branch)}` : ""}`, {
    signal: AbortSignal.timeout(SERVICES_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  return ((await res.json()) as { data?: StorefrontService[] }).data ?? [];
}
