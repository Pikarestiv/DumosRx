import Link from "next/link";

import { StorefrontCart } from "@/components/storefront/storefront-cart";
import type { StorefrontStore } from "@/lib/api/storefront-data";

interface StorefrontHeaderProps {
  storeSlug: string;
  store?: StorefrontStore | null;
}

export function StorefrontHeader({ storeSlug, store }: StorefrontHeaderProps) {
  return (
    <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link href={`/store/${storeSlug}`} className="flex items-center gap-3 min-w-0">
          {store?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- static export, arbitrary base64 data URI, next/image's domain allowlisting doesn't apply
            <img
              src={store.logo_url}
              alt=""
              className="h-9 w-9 object-contain rounded"
            />
          )}
          <span className="font-heading font-bold text-xl text-primary truncate">
            {store?.name ?? "Store"}
          </span>
        </Link>
        <div className="flex items-center gap-4 sm:gap-6">
          <nav className="flex items-center gap-3 sm:gap-5 text-sm font-medium">
            <Link
              href={`/store/${storeSlug}`}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Home
            </Link>
            <Link
              href={`/store/${storeSlug}/catalog`}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Catalog
            </Link>
          </nav>
          <StorefrontCart storeSlug={storeSlug} currency={store?.currency} />
        </div>
      </div>
    </header>
  );
}
