import { HelpCircle } from "lucide-react";

import { StoreSectionHeading } from "@/components/storefront/store-section-heading";
import type { StorefrontStore } from "@/lib/api/storefront-data";
import { storefrontCopy } from "@/lib/storefront-copy";

interface StoreFaqSectionProps {
  store?: StorefrontStore | null;
  headingAs?: "h1" | "h2";
}

export function StoreFaqSection({ store, headingAs }: StoreFaqSectionProps) {
  const copy = storefrontCopy(store);

  return (
    <section id="faq" aria-label="Frequently asked questions" className="scroll-mt-24 space-y-6">
      <StoreSectionHeading
        as={headingAs}
        title="Frequently Asked Questions"
        subtitle={copy.faqSubtitle}
      />

      <div className="space-y-4">
        {copy.faqs.map((faq) => (
          <div
            key={faq.q}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
          >
            <h3 className="flex items-center gap-2 text-foreground font-heading font-bold text-base sm:text-lg">
              <HelpCircle className="h-5 w-5 text-primary shrink-0" />
              <span>{faq.q}</span>
            </h3>
            <p className="text-sm text-muted-foreground pl-7 leading-relaxed">{faq.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
