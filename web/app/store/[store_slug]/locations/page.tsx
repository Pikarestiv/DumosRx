import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MapPin, Phone, Store as StoreIcon } from "lucide-react";

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
  const activeBranches = branches && branches.length > 0 ? branches : [store];

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

        <section className="space-y-6">
          <div className="space-y-2">
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Our Branches & Locations
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Visit our pharmacy locations for physical pickup, prescriptions,
              and healthcare inquiries.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeBranches.map((branch) => {
              const address = branch.address || branch.location || "In-store pickup available";
              return (
                <div
                  key={branch.id}
                  className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-6"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-2xl bg-primary/10 text-primary">
                          <StoreIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="font-heading font-bold text-lg text-foreground">
                            {branch.name}
                          </h2>
                          {branch.is_primary && (
                            <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                              Main Branch
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-primary/80 mt-0.5" />
                        <span>{address}</span>
                      </div>
                      {branch.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 shrink-0 text-primary/80" />
                          <a
                            href={`tel:${branch.phone}`}
                            className="hover:text-foreground transition-colors"
                          >
                            {branch.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Link
                      href={`/store/${store_slug}/catalog?branch=${branch.id}`}
                      className="inline-flex items-center justify-center w-full rounded-full text-xs font-semibold h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-colors"
                    >
                      Shop from this Branch &rarr;
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <StorefrontFooter store={store} />
    </div>
  );
}

