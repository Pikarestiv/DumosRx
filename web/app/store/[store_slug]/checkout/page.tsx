import type { Metadata } from "next";
import { Suspense } from "react";

import { CheckoutHeading } from "@/components/storefront/checkout-heading";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { resolveLocale } from "@/lib/storefront-i18n";
import { buildStorefrontCheckoutMetadata } from "@/lib/storefront-metadata";

interface CheckoutPageProps {
  params: Promise<{
    store_slug: string;
  }>;
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export async function generateMetadata({
  params,
}: CheckoutPageProps): Promise<Metadata> {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  return buildStorefrontCheckoutMetadata(store_slug, data?.store, resolveLocale(data?.storefront?.locale));
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);

  return (
    <div className="min-h-screen bg-[color:var(--sf-page)] text-[color:var(--sf-ink)] flex flex-col">
      <StorefrontHeader storeSlug={store_slug} store={data?.store} />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        <CheckoutHeading />
        <Suspense fallback={null}>
          <CheckoutForm storeSlug={store_slug} />
        </Suspense>
      </main>

      <StorefrontFooter storeSlug={store_slug} store={data?.store} storefront={data?.storefront} />
    </div>
  );
}
