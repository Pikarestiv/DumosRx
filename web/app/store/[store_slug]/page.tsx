import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductCard } from "@/components/storefront/product-card";
import { StoreContactBlock } from "@/components/storefront/store-contact-block";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";
import type { StorefrontProduct } from "@/lib/types/storefront";

interface StorefrontProps {
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
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <StorefrontHeader storeSlug={store_slug} store={store} />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-8">
        <StoreContactBlock store={store} />

        <section aria-label="Products" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.length === 0 ? (
            <p className="col-span-full text-center py-12 text-muted-foreground">
              No products are currently available online. Please check back
              later.
            </p>
          ) : (
            products.map((product: StorefrontProduct) => (
              <ProductCard
                key={product.id}
                product={product}
                storeSlug={store_slug}
                currency={store.currency}
              />
            ))
          )}
        </section>
      </main>

      <StorefrontFooter store={store} />
    </div>
  );
}
