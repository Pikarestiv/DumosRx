import Link from "next/link";
import { MapPin, Phone, Store as StoreIcon } from "lucide-react";

import { StoreSectionHeading } from "@/components/storefront/store-section-heading";
import type { StorefrontBranch, StorefrontStore } from "@/lib/api/storefront-data";
import { storeAddressLine } from "@/lib/storefront-display";
import { storefrontCopy } from "@/lib/storefront-copy";

interface StoreLocationsSectionProps {
  storeSlug: string;
  store: StorefrontStore;
  branches?: StorefrontBranch[];
  headingAs?: "h1" | "h2";
}

export function hasLocationsToShow(store: StorefrontStore, branches?: StorefrontBranch[]): boolean {
  return (branches?.length ?? 0) > 1 || storeAddressLine(store) !== null;
}

export function StoreLocationsSection({ storeSlug, store, branches, headingAs }: StoreLocationsSectionProps) {
  const activeBranches = branches && branches.length > 0 ? branches : [store];

  return (
    <section id="locations" aria-label="Locations" className="scroll-mt-24 space-y-6">
      <StoreSectionHeading
        as={headingAs}
        title="Our Branches & Locations"
        subtitle={storefrontCopy(store).locationsSubtitle}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {activeBranches.map((branch) => (
          <div
            key={branch.id}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-6"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-2xl bg-primary/10 text-primary">
                  <StoreIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-foreground">{branch.name}</h3>
                  {branch.is_primary && (
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                      Main Branch
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-primary/80 mt-0.5" />
                  <span>{branch.address || branch.location || "In-store pickup available"}</span>
                </div>
                {branch.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-primary/80" />
                    <a href={`tel:${branch.phone}`} className="hover:text-foreground transition-colors">
                      {branch.phone}
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <Link
                href={`/store/${storeSlug}/catalog?branch=${branch.id}`}
                className="inline-flex items-center justify-center w-full rounded-full text-xs font-semibold h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-colors"
              >
                Shop from this Branch &rarr;
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
