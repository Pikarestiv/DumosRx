import type { Metadata } from "next";
import { Suspense } from "react";

import { FooterSection } from "@/components/landing/footer-section";
import { StorefrontCart } from "@/components/storefront/storefront-cart";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { buildStorefrontCheckoutMetadata } from "@/lib/storefront-metadata";

interface CheckoutPageProps {
  // Next 16 passes `params` as a Promise (see app/store/[store_slug]/page.tsx)
  // - reading `params.store_slug` synchronously yields `undefined` in a
  // production build, which posted the order to /storefront/undefined/checkout.
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="font-bold text-xl text-emerald-700">
            Checkout
          </div>
          <div className="flex items-center space-x-4">
            <StorefrontCart storeSlug={store_slug} />
          </div>
        </div>
      </header>
      
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-8">
          Complete Your Order
        </h1>
        {/* CheckoutForm reads useSearchParams() (for the Paystack ?reference=
            return) - the static export prerenders this page, and Next
            requires a Suspense boundary around any useSearchParams() consumer
            so it can bail that part out to client-side rendering instead of
            failing the whole page's prerender. */}
        <Suspense fallback={null}>
          <CheckoutForm storeSlug={store_slug} />
        </Suspense>
      </main>

      <FooterSection />
    </div>
  );
}
