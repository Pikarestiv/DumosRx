import { StoreLogo } from "@/components/storefront/store-logo";
import { STOREFRONT_FONT_CLASSES } from "@/lib/storefront-fonts";
import { storefrontPresetVars, type StorefrontPreset } from "@/lib/storefront-presets";
import { DISPLAY_FONT, PRIMARY_BUTTON } from "@/lib/storefront-styles";
import { storefrontAccentVars } from "@/lib/storefront-themes";
import { cn } from "@/lib/utils";

interface StorefrontPresetPreviewProps {
  preset: StorefrontPreset;
  accent?: string | null;
  storeName: string;
  logo?: string | null;
  tagline: string;
}

const SAMPLE_CARDS = ["Sample product", "Another product"];

export function StorefrontPresetPreview({ preset, accent, storeName, logo, tagline }: StorefrontPresetPreviewProps) {
  const vars = { ...storefrontPresetVars(preset), ...storefrontAccentVars(accent || preset.accent, preset) };
  const centered = preset.hero === "centered";

  return (
    <div
      aria-hidden="true"
      className={cn("overflow-hidden rounded-lg border border-black/10 text-left", STOREFRONT_FONT_CLASSES)}
      style={{ ...vars, background: "var(--sf-page)", color: "var(--sf-ink)", fontFamily: "var(--sf-font-body)" }}
    >
      <div className="flex items-center gap-2 bg-white px-3 py-2">
        <StoreLogo name={storeName} logo={logo} className="h-6 w-6 text-xs" />
        <span className={cn(DISPLAY_FONT, "truncate text-xs")}>{storeName}</span>
      </div>
      <div
        className={cn("space-y-2 px-3 py-4 [background:var(--sf-hero-bg)] [color:var(--sf-hero-fg)]", centered && "text-center")}
      >
        <p className={cn(DISPLAY_FONT, "line-clamp-2 text-sm leading-tight")}>{tagline}</p>
        <span className={cn(PRIMARY_BUTTON, "min-h-0 px-3 py-1 text-[10px]")}>Browse products</span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {SAMPLE_CARDS.map((name) => (
          <div key={name} className="overflow-hidden border border-black/10 bg-white [border-radius:var(--sf-card-radius)]">
            <div className="h-8 [background:color-mix(in_oklab,var(--primary)_14%,#EEE6DC)]" />
            <div className="space-y-1 p-2">
              <p className="truncate text-[10px]">{name}</p>
              <p className="text-[10px] [font-family:var(--sf-font-price)] [font-weight:var(--sf-price-weight)]">₦1,500</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
