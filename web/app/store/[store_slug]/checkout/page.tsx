import type { Metadata } from "next";
import { Suspense } from "react";

import { CheckoutForm } from "@/components/storefront/checkout-form";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
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
  return buildStorefrontCheckoutMetadata(store_slug, data?.store);
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);

  return (
    <div className="min-h-screen bg-[color:var(--sf-page)] text-[color:var(--sf-ink)] flex flex-col">
      <StorefrontHeader storeSlug={store_slug} store={data?.store} />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground mb-8">
          Complete Your Order
        </h1>
        <Suspense fallback={null}>
          <CheckoutForm storeSlug={store_slug} />
        </Suspense>
      </main>

      <StorefrontFooter storeSlug={store_slug} store={data?.store} storefront={data?.storefront} />
    </div>
  );
}
