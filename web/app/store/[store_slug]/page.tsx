import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FooterSection } from "@/components/landing/footer-section";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/storefront/product-card";
import { StorefrontCart } from "@/components/storefront/storefront-cart";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";
import type { StorefrontProduct } from "@/lib/types/storefront";

interface StorefrontProps {
  // Next 16 passes `params` as a Promise and, in a production build, it is a
  // plain Promise with no property proxy - reading `params.store_slug`
  // synchronously yields `undefined`, not the slug. It must be awaited.
  params: Promise<{
    store_slug: string;
  }>;
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export async function generateMetadata({
  params,
}: StorefrontProps): Promise<Metadata> {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  return buildStorefrontMetadata(store_slug, data?.store);
}

export default async function StorefrontPage({ params }: StorefrontProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);

  if (!data) {
    notFound();
  }

  const { store, products } = data;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Custom simplified header for storefront */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {store.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- static export, arbitrary base64 data URI, next/image's domain allowlisting doesn't apply
              <img
                src={store.logo_url}
                alt={`${store.name} logo`}
                className="h-9 w-9 object-contain rounded"
              />
            )}
            <div className="font-bold text-xl text-emerald-700">{store.name}</div>
          </div>
          <div className="flex items-center space-x-4">
            <StorefrontCart storeSlug={store_slug} />
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
              <ProductCard
                key={product.id}
                product={product}
                storeSlug={store_slug}
              />
            ))
          )}
        </div>
      </main>

      <FooterSection />
    </div>
  );
}
