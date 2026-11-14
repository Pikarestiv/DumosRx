import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StoreClosedNotice } from "@/components/storefront/store-closed-notice";
import { CatalogHeading } from "@/components/storefront/catalog-heading";
import { StorefrontCatalogView } from "@/components/storefront/storefront-catalog-view";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData, getStorefrontProducts } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { resolveLocale, translate } from "@/lib/storefront-i18n";
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
  const locale = resolveLocale(data?.storefront?.locale);
  const base = buildStorefrontMetadata(store_slug, data?.store, locale);
  const shop = translate(locale, "shop.title");
  return {
    ...base,
    title: data?.store?.name ? `${shop} | ${data.store.name}` : shop,
  };
}

export default async function StorefrontCatalogPage({
  params,
}: CatalogPageProps) {
  const { store_slug } = await params;

  const [data, initialCatalog] = await Promise.all([
    getStorefrontData(store_slug),
    getStorefrontProducts(store_slug, { page: 1 }),
  ]);

  if (!data) {
    notFound();
  }

  const { store, storefront, branches } = data;
  const selectedBranchId = store.id;

  return (
    <div className="min-h-screen bg-[color:var(--sf-page)] text-[color:var(--sf-ink)] flex flex-col">
      <StorefrontHeader
        storeSlug={store_slug}
        store={store}
        storefront={storefront}
        branches={branches}
        selectedBranchId={selectedBranchId}
      />

      <StoreClosedNotice hours={storefront?.opening_hours} timeZone={store.timezone} />

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-6">
        <CatalogHeading storeSlug={store_slug} storeName={storefront?.name || store.name} />

        <StorefrontCatalogView
          storeSlug={store_slug}
          currency={store.currency}
          whatsapp={storefront?.whatsapp}
          initialData={initialCatalog}
        />
      </main>

      <StorefrontFooter storeSlug={store_slug} store={store} storefront={storefront} />
    </div>
  );
}
