import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";

import { ProductCard } from "@/components/storefront/product-card";
import { StoreAboutSection } from "@/components/storefront/store-about-section";
import { StoreContactBlock } from "@/components/storefront/store-contact-block";
import { StoreFaqSection } from "@/components/storefront/store-faq-section";
import { StoreLocationsSection, hasLocationsToShow } from "@/components/storefront/store-locations-section";
import { StoreSectionHeading } from "@/components/storefront/store-section-heading";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { hasContactDetails, viewAllProductsLabel } from "@/lib/storefront-display";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";

const FEATURED_PRODUCT_COUNT = 8;
const MOBILE_FEATURED_COUNT = 4;

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

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold h-11 px-6 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors";
const OUTLINE_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold h-11 px-6 border border-border bg-background hover:bg-muted text-foreground transition-colors";

export default async function StorefrontPage({
  params,
}: StorefrontProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);

  if (!data) {
    notFound();
  }

  const { store, products, storefront, branches, product_count } = data;
  const businessName = storefront?.name || store.name;
  const catalogHref = `/store/${store_slug}/catalog`;
  const featured = products.slice(0, FEATURED_PRODUCT_COUNT);
  const showContact = hasContactDetails(store);

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <StorefrontHeader
        storeSlug={store_slug}
        store={store}
        storefront={storefront}
        branches={branches}
        selectedBranchId={store.id}
      />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-16">
        <section aria-label="Welcome" className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-12 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10" />
          <div className="relative max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5 shrink-0" /> Fast Pickup & Delivery
            </div>
            <h1 className="font-heading text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
              {businessName}
            </h1>
            <p className="text-muted-foreground text-sm sm:text-lg leading-relaxed">
              Order online and collect from your nearest branch, or have it delivered.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link href={catalogHref} className={PRIMARY_BUTTON}>
                Shop now <ArrowRight className="h-4 w-4" />
              </Link>
              {showContact && (
                <Link href={`/store/${store_slug}#contact`} className={OUTLINE_BUTTON}>
                  Contact us
                </Link>
              )}
            </div>
          </div>
        </section>

        <section aria-label="Featured products" className="space-y-6">
          <StoreSectionHeading title="Featured Products" />

          {featured.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">
              No products are currently available online. Please check back
              later.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                {featured.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    storeSlug={store_slug}
                    currency={store.currency}
                    className={index >= MOBILE_FEATURED_COUNT ? "hidden sm:flex" : undefined}
                  />
                ))}
              </div>
              <div className="flex justify-center">
                <Link href={catalogHref} className={OUTLINE_BUTTON}>
                  {viewAllProductsLabel(products.length, product_count)} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </>
          )}
        </section>

        <section aria-label="Highlights" className="text-center space-y-4 py-6 max-w-3xl mx-auto">
          <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            {storefront?.headline || "Genuine products, ready when you are"}
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
            Browse everything in stock online, pay securely, and pick up at the counter without the wait.
          </p>
          <Link href={catalogHref} className={PRIMARY_BUTTON}>
            Browse the shop <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <StoreAboutSection store={store} storefront={storefront} />

        {hasLocationsToShow(store, branches) && (
          <StoreLocationsSection storeSlug={store_slug} store={store} branches={branches} />
        )}

        <StoreFaqSection store={store} />

        {showContact && (
          <section id="contact" aria-label="Contact" className="scroll-mt-24 space-y-6">
            <StoreSectionHeading title="Contact Us" subtitle={`Questions about an order or a product? Reach ${businessName} directly.`} />
            <StoreContactBlock store={store} />
          </section>
        )}
      </main>

      <StorefrontFooter storeSlug={store_slug} store={store} storefront={storefront} />
    </div>
  );
}
