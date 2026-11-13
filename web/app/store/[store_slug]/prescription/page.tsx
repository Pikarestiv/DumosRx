import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileUp } from "lucide-react";

import { StorePrescriptionForm } from "@/components/storefront/store-prescription-form";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";

interface PrescriptionPageProps {
  params: Promise<{
    store_slug: string;
  }>;
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export async function generateMetadata({
  params,
}: PrescriptionPageProps): Promise<Metadata> {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  const base = buildStorefrontMetadata(store_slug, data?.store);
  return {
    ...base,
    title: data?.store?.name
      ? `Upload Prescription | ${data.store.name}`
      : "Upload Prescription",
  };
}

export default async function StorefrontPrescriptionPage({
  params,
}: PrescriptionPageProps) {
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

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto w-full space-y-6">
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
          <span className="text-foreground font-medium">Upload Prescription</span>
        </nav>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
            <FileUp className="h-3.5 w-3.5" /> Confidential & Encrypted
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Upload Doctor&apos;s Prescription
          </h1>
          <p className="text-sm text-muted-foreground">
            Have a prescription from your hospital or physician? Upload a clear
            photo or PDF document, and our licensed pharmacist will prepare your
            order.
          </p>
        </div>

        <StorePrescriptionForm storeSlug={store_slug} branches={branches} />
      </main>

      <StorefrontFooter storeSlug={store_slug} store={store} storefront={storefront} />
    </div>
  );
}

