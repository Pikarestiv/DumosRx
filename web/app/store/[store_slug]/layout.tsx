import { MobileCartBar } from "@/components/storefront/mobile-cart-bar";
import { StorefrontI18nProvider } from "@/components/storefront/storefront-i18n-provider";
import { getStorefrontData } from "@/lib/api/storefront-data";
import { preload } from "react-dom";

import { resolveEnabledLocales, resolveLocale } from "@/lib/storefront-i18n";
import { storefrontDisplayFontUrl, storefrontFontFaceCss } from "@/lib/storefront-fonts";
import { storefrontPresetCss } from "@/lib/storefront-presets";
import {
  resolveStorefrontPreset,
  resolveStorefrontTheme,
  storefrontAccentCss,
  storefrontThemeCss,
} from "@/lib/storefront-themes";

interface StorefrontLayoutProps {
  children: React.ReactNode;
  params: Promise<{ store_slug: string }>;
}

export default async function StorefrontLayout({ children, params }: StorefrontLayoutProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  const theme = resolveStorefrontTheme(data?.storefront?.theme);
  const preset = resolveStorefrontPreset(data?.storefront?.theme, data?.store?.store_type);

  const defaultLocale = resolveLocale(data?.storefront?.locale);
  const enabledLocales = resolveEnabledLocales(defaultLocale, data?.storefront?.enabled_locales);

  preload(storefrontDisplayFontUrl(preset.id), { as: "font", type: "font/woff2", crossOrigin: "anonymous" });

  return (
    <div
      data-storefront-theme={theme.id}
      data-storefront-preset={preset.id}
      className="contents"
    >
      <style>{storefrontFontFaceCss([preset.id]) + storefrontThemeCss() + storefrontPresetCss() + storefrontAccentCss(data?.storefront?.accent, preset)}</style>
      <StorefrontI18nProvider defaultLocale={defaultLocale} enabledLocales={enabledLocales}>
        {children}
        <MobileCartBar storeSlug={store_slug} currency={data?.store?.currency} />
      </StorefrontI18nProvider>
    </div>
  );
}
