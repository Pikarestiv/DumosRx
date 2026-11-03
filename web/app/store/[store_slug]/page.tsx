import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

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

export default async function StorefrontPage({
  params,
}: StorefrontProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);

  if (!data) {
    notFound();
  }

  const { store, products, storefront, branches } = data;
  const selectedBranchId = store.id;

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <StorefrontHeader
        storeSlug={store_slug}
        store={store}
        storefront={storefront}
        branches={branches}
        selectedBranchId={selectedBranchId}
      />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-8">
        <section aria-label="Welcome" className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5 shrink-0" /> Fast Pickup & Delivery
            </div>
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              {storefront?.headline || storefront?.name || store.name}
            </h1>
            {storefront?.about && (
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                {storefront.about}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href={`/store/${store_slug}/catalog`}
                className="inline-flex items-center justify-center rounded-full text-sm font-semibold h-10 px-5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors"
              >
                Browse Catalog &rarr;
              </Link>
              {branches && branches.length > 1 && (
                <Link
                  href={`/store/${store_slug}/locations`}
                  className="inline-flex items-center justify-center rounded-full text-sm font-semibold h-10 px-5 border border-border bg-background hover:bg-accent text-foreground transition-colors"
                >
                  View Locations
                </Link>
              )}
            </div>
          </div>
        </section>

        <StoreContactBlock store={store} />

        <section aria-label="Products" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              Featured Products
            </h2>
            <Link
              href={`/store/${store_slug}/catalog`}
              className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
            >
              View Full Catalog &rarr;
            </Link>
          </div>

          {products.length === 0 ? (
            <p className="col-span-full text-center py-12 text-muted-foreground">
              No products are currently available online. Please check back
              later.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product: StorefrontProduct) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  storeSlug={store_slug}
                  currency={store.currency}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <StorefrontFooter store={store} />
    </div>
  );
}
