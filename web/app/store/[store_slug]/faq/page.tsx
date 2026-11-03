import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, HelpCircle } from "lucide-react";

import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";

interface FaqPageProps {
  params: Promise<{
    store_slug: string;
  }>;
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export async function generateMetadata({
  params,
}: FaqPageProps): Promise<Metadata> {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  const base = buildStorefrontMetadata(store_slug, data?.store);
  return {
    ...base,
    title: data?.store?.name ? `FAQ & Policies | ${data.store.name}` : "FAQ",
  };
}

export default async function StorefrontFaqPage({ params }: FaqPageProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);

  if (!data) {
    notFound();
  }

  const { store, storefront, branches } = data;
  const businessName = storefront?.name || store.name;

  const faqs = [
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
      a: "Prescription medications require a valid doctor's prescription. You can present your physical prescription upon pickup or upload it through our prescription portal.",
    },
    {
      q: "How can I switch branches?",
      a: "You can select your preferred pickup branch using the branch switcher in the header or via the Locations page. Because inventory is live at each store, switching branches will update item availability.",
    },
    {
      q: "What is your return policy for pharmaceuticals?",
      a: "In accordance with regulatory healthcare guidelines, dispensed medications cannot be returned or refunded once they leave pharmacy custody, except in the case of verified manufacturing recall.",
    },
  ];

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <StorefrontHeader
        storeSlug={store_slug}
        store={store}
        storefront={storefront}
        branches={branches}
      />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full space-y-8">
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
          <span className="text-foreground font-medium">FAQ & Policies</span>
        </nav>

        <section className="space-y-6">
          <div className="space-y-2">
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Frequently Asked Questions
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Everything you need to know about ordering, pickup, and pharmacy
              policies.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
              >
                <div className="flex items-center gap-2 text-foreground font-heading font-bold text-base sm:text-lg">
                  <HelpCircle className="h-5 w-5 text-primary shrink-0" />
                  <span>{faq.q}</span>
                </div>
                <p className="text-sm text-muted-foreground pl-7 leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <StorefrontFooter store={store} />
    </div>
  );
}

