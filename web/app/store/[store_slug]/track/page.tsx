import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { StoreOrderTracker } from "@/components/storefront/store-order-tracker";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";

interface TrackPageProps {
  params: Promise<{
    store_slug: string;
  }>;
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export async function generateMetadata({
  params,
}: TrackPageProps): Promise<Metadata> {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  const base = buildStorefrontMetadata(store_slug, data?.store);
  return {
    ...base,
    title: data?.store?.name
      ? `Track Order | ${data.store.name}`
      : "Track Order",
  };
}

export default async function StorefrontTrackPage({ params }: TrackPageProps) {
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

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto w-full space-y-6">
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
          <span className="text-foreground font-medium">Track Order</span>
        </nav>

        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Track Your Order
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your Order Reference or Paystack transaction code to check
            live fulfillment status.
          </p>
        </div>

        <StoreOrderTracker storeSlug={store_slug} />
      </main>

      <StorefrontFooter storeSlug={store_slug} store={store} storefront={storefront} />
    </div>
  );
}

