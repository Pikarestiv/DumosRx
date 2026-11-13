import { HeartHandshake, ShieldCheck, Truck } from "lucide-react";

import { StoreSectionHeading } from "@/components/storefront/store-section-heading";
import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";

const CARE_PROMISES = [
  {
    icon: ShieldCheck,
    title: "100% Genuine Care",
    body: "Verified batch testing, strict temperature control, and genuine products.",
  },
  {
    icon: Truck,
    title: "Fast Fulfillment",
    body: "In-store pickup readiness within minutes or quick neighborhood delivery.",
  },
  {
    icon: HeartHandshake,
    title: "Expert Consultation",
    body: "Experienced pharmacists available to guide dosage and regimen adherence.",
  },
];

interface StoreAboutSectionProps {
  store: StorefrontStore;
  storefront?: StorefrontProfile | null;
  headingAs?: "h1" | "h2";
}

export function StoreAboutSection({ store, storefront, headingAs }: StoreAboutSectionProps) {
  const businessName = storefront?.name || store.name;

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
          storefront?.headline ||
          "Dedicated to providing genuine healthcare products, professional pharmacy guidance, and seamless customer service."
        }
      />

      <div className="text-muted-foreground text-sm sm:text-base leading-relaxed space-y-4">
        <p>
          {storefront?.about ||
            `${businessName} is committed to delivering accessible, high-quality pharmaceuticals and wellness essentials to our community. Every product in our catalog is sourced directly from certified manufacturers and accredited distributors.`}
        </p>
        <p>
          Whether you are ordering your daily maintenance prescriptions or
          over-the-counter family wellness items, our pharmacy team is here to
          ensure your care is fast, confidential, and safe.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-slate-100 dark:border-slate-800">
        {CARE_PROMISES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="p-4 rounded-2xl bg-muted/30 border border-border/60 space-y-2">
            <Icon className="h-6 w-6 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">{title}</h3>
            <p className="text-xs text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
