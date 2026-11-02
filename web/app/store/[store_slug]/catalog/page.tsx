import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";

import { StorefrontCatalogView } from "@/components/storefront/storefront-catalog-view";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData, getStorefrontProducts } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";

interface CatalogPageProps {
  params: Promise<{
    store_slug: string;
  }>;
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export async function generateMetadata({
  params,
}: CatalogPageProps): Promise<Metadata> {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  const base = buildStorefrontMetadata(store_slug, data?.store);
  return {
    ...base,
    title: data?.store?.name ? `Catalog | ${data.store.name}` : "Catalog",
  };
}

export default async function StorefrontCatalogPage({ params }: CatalogPageProps) {
  const { store_slug } = await params;
  const [data, initialCatalog] = await Promise.all([
    getStorefrontData(store_slug),
    getStorefrontProducts(store_slug, { page: 1 }),
  ]);

  if (!data) {
    notFound();
  }

  const { store } = data;

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <StorefrontHeader storeSlug={store_slug} store={store} />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href={`/store/${store_slug}`} className="hover:text-foreground transition-colors">
            {store.name}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">Catalog</span>
        </nav>

        <div className="flex items-center justify-between">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Product Catalog
          </h1>
        </div>

        <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Loading catalog…</div>}>
          <StorefrontCatalogView
            storeSlug={store_slug}
            currency={store.currency}
            initialData={initialCatalog}
          />
        </Suspense>
      </main>

      <StorefrontFooter store={store} />
    </div>
  );
}
