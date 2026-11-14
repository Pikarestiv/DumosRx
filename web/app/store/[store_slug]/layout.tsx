import { getStorefrontData } from "@/lib/api/storefront-data";
import { STOREFRONT_FONT_CLASSES } from "@/lib/storefront-fonts";
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

  return (
    <div
      data-storefront-theme={theme.id}
      data-storefront-preset={preset.id}
      className={`contents ${STOREFRONT_FONT_CLASSES}`}
    >
      <style>{storefrontThemeCss() + storefrontPresetCss() + storefrontAccentCss(data?.storefront?.accent, preset)}</style>
      {children}
    </div>
  );
}
