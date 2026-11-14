import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FeaturedProducts } from "@/components/storefront/featured-products";
import { StoreClosedNotice } from "@/components/storefront/store-closed-notice";
import { OrderingSteps } from "@/components/storefront/ordering-steps";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontHero } from "@/components/storefront/storefront-hero";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { isPharmacyStore } from "@/lib/storefront-copy";
import { resolveLocale } from "@/lib/storefront-i18n";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";
import { whatsappLink } from "@/lib/storefront-product";
import { resolveStorefrontPreset } from "@/lib/storefront-themes";

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
  return buildStorefrontMetadata(store_slug, data?.store, resolveLocale(data?.storefront?.locale));
}

export default async function StorefrontPage({
  params,
}: StorefrontProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);

  if (!data) {
    notFound();
  }

  const { store, products, storefront, branches, product_count } = data;
  const preset = resolveStorefrontPreset(storefront?.theme, store.store_type);
  const catalogHref = `/store/${store_slug}/catalog`;
  const tagline = storefront?.tagline?.trim() || storefront?.headline?.trim();
  const whatsapp = storefront?.whatsapp;

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--sf-page)] text-[color:var(--sf-ink)]">
      <StorefrontHeader
        storeSlug={store_slug}
        store={store}
        storefront={storefront}
        branches={branches}
        selectedBranchId={store.id}
      />

      <StoreClosedNotice hours={storefront?.opening_hours} />

      <StorefrontHero
        variant={preset.hero}
        tagline={tagline}
        isPharmacy={isPharmacyStore(store)}
        store={store}
        storefront={storefront}
        catalogHref={catalogHref}
        whatsappHref={whatsappLink(whatsapp)}
      />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 space-y-16 px-4 py-10 outline-none sm:px-6 lg:px-8">
        <FeaturedProducts
          products={products}
          productCount={product_count}
          storeSlug={store_slug}
          currency={store.currency}
          whatsapp={whatsapp}
          catalogHref={catalogHref}
        />
        <OrderingSteps isPharmacy={isPharmacyStore(store)} />
      </main>

      <StorefrontFooter storeSlug={store_slug} store={store} storefront={storefront} />
    </div>
  );
}
