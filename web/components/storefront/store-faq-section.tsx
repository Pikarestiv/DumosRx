import { HelpCircle } from "lucide-react";

import { StoreSectionHeading } from "@/components/storefront/store-section-heading";

const FAQS = [
  {
    q: "How does in-store pickup work?",
    a: "Once you place your order online, our dispensary prepares your items immediately. You will receive an SMS/WhatsApp or email confirmation when your package is ready for pickup at your selected branch.",
  },
  {
    q: "What payment methods are supported?",
    a: "Depending on your selected branch, we accept secure online card payments via Paystack, direct bank transfers, or payment on pickup (cash/POS at the counter).",
  },
  {
    q: "Can I order prescription-only medications?",
    a: "Prescription medications require a valid doctor's prescription. Please present your physical prescription upon pickup.",
  },
  {
    q: "How can I switch branches?",
    a: "You can select your preferred pickup branch using the branch switcher in the header or from the Locations section. Because inventory is live at each store, switching branches will update item availability.",
  },
  {
    q: "What is your return policy for pharmaceuticals?",
    a: "In accordance with regulatory healthcare guidelines, dispensed medications cannot be returned or refunded once they leave pharmacy custody, except in the case of verified manufacturing recall.",
  },
];

export function StoreFaqSection({ headingAs }: { headingAs?: "h1" | "h2" }) {
  return (
    <section id="faq" aria-label="Frequently asked questions" className="scroll-mt-24 space-y-6">
      <StoreSectionHeading
        as={headingAs}
        title="Frequently Asked Questions"
        subtitle="Everything you need to know about ordering, pickup, and pharmacy policies."
      />

      <div className="space-y-4">
        {FAQS.map((faq) => (
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
