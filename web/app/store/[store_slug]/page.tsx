import { notFound } from "next/navigation";

import { FooterSection } from "@/components/landing/footer-section";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/storefront/product-card";
import { StorefrontCart } from "@/components/storefront/storefront-cart";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import type { StorefrontProduct } from "@/lib/types/storefront";

interface StorefrontProps {
  params: {
    store_slug: string;
  };
}

async function getStorefrontData(store_slug: string) {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
  const res = await fetch(`${apiUrl}/storefront/${store_slug}`, {
    next: { revalidate: 60 }, // Cache for 60 seconds
  });

  // A misbehaving/misconfigured API (wrong URL, an outage, a proxy's error
  // page) can return an HTML error page with a 200/OK status — res.json()
  // would throw on that, and at build time that throw takes down the
  // entire production build, not just this one page.
  if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) {
    return null;
  }
  return res.json();
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export default async function StorefrontPage({ params }: StorefrontProps) {
  const data = await getStorefrontData(params.store_slug);

  if (!data) {
    notFound();
  }

  const { store, products } = data;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Custom simplified header for storefront */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="font-bold text-xl text-emerald-700">{store.name}</div>
          <div className="flex items-center space-x-4">
            <StorefrontCart storeSlug={params.store_slug} />
          </div>
        </div>
      </header>

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            {store.name}
          </h1>
          <p className="mt-4 text-xl text-gray-500">
            {store.location ||
              store.address ||
              "Your trusted local store, now online."}
          </p>
          {(store.phone || store.email) && (
            <div className="mt-4 flex flex-col sm:flex-row gap-4 items-center md:justify-start justify-center">
              {store.phone && (
                <Badge variant="secondary" className="text-md py-1 px-3">
                  Call: {store.phone}
                </Badge>
              )}
              {store.email && (
                <Badge variant="secondary" className="text-md py-1 px-3">
                  Email: {store.email}
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500">
              No products are currently available online. Please check back
              later.
            </div>
          ) : (
            products.map((product: StorefrontProduct) => (
              <ProductCard key={product.id} product={product} />
            ))
          )}
        </div>
      </main>

      <FooterSection />
    </div>
  );
}
