import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, HeartHandshake, ShieldCheck, Truck } from "lucide-react";

import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";

interface AboutPageProps {
  params: Promise<{
    store_slug: string;
  }>;
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export async function generateMetadata({
  params,
}: AboutPageProps): Promise<Metadata> {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  const base = buildStorefrontMetadata(store_slug, data?.store);
  return {
    ...base,
    title: data?.store?.name ? `About Us | ${data.store.name}` : "About Us",
  };
}

export default async function StorefrontAboutPage({ params }: AboutPageProps) {
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
          <span className="text-foreground font-medium">About</span>
        </nav>

        <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="space-y-3">
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              About {businessName}
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              {storefront?.headline ||
                "Dedicated to providing genuine healthcare products, professional pharmacy guidance, and seamless customer service."}
            </p>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none text-muted-foreground text-sm sm:text-base leading-relaxed space-y-4">
            <p>
              {storefront?.about ||
                `${businessName} is committed to delivering accessible, high-quality pharmaceuticals and wellness essentials to our community. Every product in our catalog is sourced directly from certified manufacturers and accredited distributors.`}
            </p>
            <p>
              Whether you are ordering your daily maintenance prescriptions or
              over-the-counter family wellness items, our pharmacy team is here
              to ensure your care is fast, confidential, and safe.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-slate-100 dark:border-slate-800">
            <div className="p-4 rounded-2xl bg-muted/30 border border-border/60 space-y-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">
                100% Genuine Care
              </h3>
              <p className="text-xs text-muted-foreground">
                Verified batch testing, strict temperature control, and genuine
                products.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-muted/30 border border-border/60 space-y-2">
              <Truck className="h-6 w-6 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">
                Fast Fulfillment
              </h3>
              <p className="text-xs text-muted-foreground">
                In-store pickup readiness within minutes or quick neighborhood
                delivery.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-muted/30 border border-border/60 space-y-2">
              <HeartHandshake className="h-6 w-6 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">
                Expert Consultation
              </h3>
              <p className="text-xs text-muted-foreground">
                Experienced pharmacists available to guide dosage and regimen
                adherence.
              </p>
            </div>
          </div>
        </section>
      </main>

      <StorefrontFooter store={store} />
    </div>
  );
}

