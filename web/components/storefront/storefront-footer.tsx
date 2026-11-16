"use client";

import { StoreLogo } from "@/components/storefront/store-logo";
import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { WEB_APP_HOST, WEB_APP_URL } from "@/lib/constants";
import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";
import { storeAddressLine } from "@/lib/storefront-display";
import { summarizeHours } from "@/lib/storefront-hours";

interface StorefrontFooterProps {
  storeSlug: string;
  store?: StorefrontStore | null;
  storefront?: StorefrontProfile | null;
}

export function StorefrontFooter({ store, storefront }: StorefrontFooterProps) {
  const { t, locale } = useStorefrontI18n();
  const businessName = storefront?.name || store?.name || t("footer.fallbackName");
  const logo = storefront?.logo_url || store?.logo_url;
  const details = [store ? storeAddressLine(store) : null, summarizeHours(storefront?.opening_hours, locale)].filter(Boolean);

  return (
    <footer className="border-t border-black/10 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-24 pt-8 text-sm sm:pb-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <StoreLogo name={businessName} logo={logo} className="h-9 w-9 text-base" />
          <p>
            © {new Date().getFullYear()} {businessName}
          </p>
        </div>
        {details.length > 0 && <p className="opacity-80 md:text-center">{details.join("   ")}</p>}
        <a href={WEB_APP_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 opacity-80 hover:opacity-100">
          {t("footer.powered", { host: WEB_APP_HOST })}
        </a>
      </div>
    </footer>
  );
}
