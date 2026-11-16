import { HeartHandshake, ShieldCheck, Truck } from "lucide-react";

import { StoreSectionHeading } from "@/components/storefront/store-section-heading";
import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";
import { storefrontCopy } from "@/lib/storefront-copy";

const PROMISE_ICONS = [ShieldCheck, Truck, HeartHandshake];

interface StoreAboutSectionProps {
  store: StorefrontStore;
  storefront?: StorefrontProfile | null;
  headingAs?: "h1" | "h2";
}

export function StoreAboutSection({ store, storefront, headingAs }: StoreAboutSectionProps) {
  const businessName = storefront?.name || store.name;
  const copy = storefrontCopy(store);

  return (
    <section
      id="about"
      aria-label="About"
      className="scroll-mt-24 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6"
    >
      <StoreSectionHeading
        as={headingAs}
        title={`About ${businessName}`}
        subtitle={
          storefront?.headline || copy.aboutSubtitle
        }
      />

      <div className="text-muted-foreground text-sm sm:text-base leading-relaxed space-y-4">
        <p>
          {storefront?.about || copy.aboutBody(businessName)}
        </p>
        <p>{copy.aboutClosing}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-slate-100 dark:border-slate-800">
        {copy.promises.map(({ title, body }, index) => {
          const Icon = PROMISE_ICONS[index];
          return (
            <div key={title} className="p-4 rounded-2xl bg-muted/30 border border-border/60 space-y-2">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">{title}</h3>
              <p className="text-xs text-muted-foreground">{body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
