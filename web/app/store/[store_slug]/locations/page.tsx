import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { StoreLocationsSection } from "@/components/storefront/store-locations-section";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";

interface LocationsPageProps {
  params: Promise<{
    store_slug: string;
  }>;
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export async function generateMetadata({
  params,
}: LocationsPageProps): Promise<Metadata> {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  const base = buildStorefrontMetadata(store_slug, data?.store);
  return {
    ...base,
    title: data?.store?.name
      ? `Our Locations | ${data.store.name}`
      : "Locations",
  };
}

export default async function StorefrontLocationsPage({
  params,
}: LocationsPageProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);

  if (!data) {
    notFound();
  }

  const { store, storefront, branches } = data;
  const businessName = storefront?.name || store.name;

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <StorefrontHeader
        storeSlug={store_slug}
        store={store}
        storefront={storefront}
        branches={branches}
      />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full space-y-8">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link
            href={`/store/${store_slug}`}
            className="hover:text-foreground transition-colors"
          >
            {businessName}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">Locations</span>
        </nav>

        <StoreLocationsSection storeSlug={store_slug} store={store} branches={branches} headingAs="h1" />
      </main>

      <StorefrontFooter storeSlug={store_slug} store={store} storefront={storefront} />
    </div>
  );
}

