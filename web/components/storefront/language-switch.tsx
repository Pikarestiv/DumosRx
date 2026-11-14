"use client";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { LOCALE_NAMES } from "@/lib/storefront-i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitch() {
  const { locale, enabledLocales, setLocale, t } = useStorefrontI18n();

  if (enabledLocales.length < 2) return null;

  return (
    <div role="group" aria-label={t("language.label")} className="flex items-center gap-1">
      {enabledLocales.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === locale}
          aria-label={LOCALE_NAMES[code]}
          onClick={() => setLocale(code)}
          className={cn(
            "min-h-11 min-w-11 rounded px-2 text-xs font-semibold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
            code === locale ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]" : "opacity-80 hover:opacity-100",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
