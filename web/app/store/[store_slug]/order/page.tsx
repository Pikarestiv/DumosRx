import type { Metadata } from "next";

import { OrderConfirmation } from "@/components/storefront/order-confirmation";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { resolveLocale, translate } from "@/lib/storefront-i18n";
import { storefrontUrl } from "@/lib/storefront-metadata";

interface OrderPageProps {
  params: Promise<{ store_slug: string }>;
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export async function generateMetadata({ params }: OrderPageProps): Promise<Metadata> {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  const locale = resolveLocale(data?.storefront?.locale);

  return {
    title: { absolute: translate(locale, "order.meta", { name: data?.store?.name ?? "" }) },
    alternates: { canonical: `${storefrontUrl(store_slug)}order/` },
    robots: { index: false, follow: false },
  };
}

export default async function OrderPage({ params }: OrderPageProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);

  return (
    <div className="min-h-screen bg-[color:var(--sf-page)] text-[color:var(--sf-ink)] flex flex-col">
      <StorefrontHeader storeSlug={store_slug} store={data?.store} storefront={data?.storefront} />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 outline-none sm:px-6 lg:px-8">
        <OrderConfirmation storeSlug={store_slug} />
      </main>

      <StorefrontFooter storeSlug={store_slug} store={data?.store} storefront={data?.storefront} />
    </div>
  );
}
