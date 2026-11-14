export interface StorefrontService {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
}

const SERVICES_REQUEST_TIMEOUT_MS = 15_000;

export async function getStorefrontServices(storeSlug: string): Promise<StorefrontService[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
  const res = await fetch(`${apiUrl}/storefront/${storeSlug}/services`, {
    signal: AbortSignal.timeout(SERVICES_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  return ((await res.json()) as { data?: StorefrontService[] }).data ?? [];
}
