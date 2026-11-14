"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { DISPLAY_FONT } from "@/lib/storefront-styles";

export function CatalogHeading({ storeSlug, storeName }: { storeSlug: string; storeName: string }) {
  const { t } = useStorefrontI18n();

  return (
    <>
      <nav aria-label={t("shop.breadcrumb")} className="flex items-center gap-1.5 text-xs opacity-80">
        <Link href={`/store/${storeSlug}`} className="underline-offset-4 hover:underline">
          {storeName}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium">{t("shop.title")}</span>
      </nav>

      <div className="flex items-center justify-between">
        <h1 className={`${DISPLAY_FONT} text-3xl sm:text-4xl`}>{t("shop.title")}</h1>
      </div>
    </>
  );
}
