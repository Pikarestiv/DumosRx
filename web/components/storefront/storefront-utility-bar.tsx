"use client";

import { LanguageSwitch } from "@/components/storefront/language-switch";
import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";

export function StorefrontUtilityBar() {
  const { t } = useStorefrontI18n();

  return (
    <div className="bg-[color:var(--sf-ink)] text-[color:var(--sf-page)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-xs sm:px-6 lg:px-8">
        <p>{t("utility.pickup")}</p>
        <LanguageSwitch />
      </div>
    </div>
  );
}
