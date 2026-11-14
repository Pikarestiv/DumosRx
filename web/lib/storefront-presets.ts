export type StorefrontPresetId = "workshop" | "clinic" | "studio";
export type StorefrontHeroVariant = "band" | "tint" | "centered";
export type StorefrontButtonShape = "square" | "pill" | "pill-outline";
export type StorefrontAddButton = "ink" | "accent" | "outline";

export interface StorefrontPreset {
  id: StorefrontPresetId;
  label: string;
  page: string;
  ink: string;
  accent: string;
  hero: StorefrontHeroVariant;
  button: StorefrontButtonShape;
  addButton: StorefrontAddButton;
  cardRadius: string;
  displayFont: string;
  displayWeight: number;
  bodyFont: string;
  priceFont: string;
  priceWeight: number;
}

const SANS_FALLBACK = "system-ui, sans-serif";

export const STOREFRONT_PRESETS: readonly StorefrontPreset[] = [
  {
    id: "workshop",
    label: "Workshop",
    page: "#F7F5F0",
    ink: "#141412",
    accent: "#F2B705",
    hero: "band",
    button: "square",
    addButton: "ink",
    cardRadius: "10px",
    displayFont: `var(--font-archivo), ${SANS_FALLBACK}`,
    displayWeight: 800,
    bodyFont: `var(--font-plex-sans), ${SANS_FALLBACK}`,
    priceFont: `var(--font-plex-mono), ui-monospace, monospace`,
    priceWeight: 600,
  },
  {
    id: "clinic",
    label: "Clinic",
    page: "#F6F9F8",
    ink: "#0E2A25",
    accent: "#0F6B58",
    hero: "tint",
    button: "pill",
    addButton: "accent",
    cardRadius: "14px",
    displayFont: `var(--font-figtree), ${SANS_FALLBACK}`,
    displayWeight: 800,
    bodyFont: `var(--font-figtree), ${SANS_FALLBACK}`,
    priceFont: `var(--font-figtree), ${SANS_FALLBACK}`,
    priceWeight: 700,
  },
  {
    id: "studio",
    label: "Studio",
    page: "#F6EEE9",
    ink: "#33232A",
    accent: "#7A4252",
    hero: "centered",
    button: "pill-outline",
    addButton: "outline",
    cardRadius: "4px",
    displayFont: `var(--font-fraunces), Georgia, serif`,
    displayWeight: 500,
    bodyFont: `var(--font-dm-sans), ${SANS_FALLBACK}`,
    priceFont: `var(--font-dm-sans), ${SANS_FALLBACK}`,
    priceWeight: 500,
  },
];

const PRESETS_BY_ID: ReadonlyMap<string, StorefrontPreset> = new Map(
  STOREFRONT_PRESETS.map((preset) => [preset.id, preset]),
);

export const getStorefrontPreset = (id: string): StorefrontPreset | undefined => PRESETS_BY_ID.get(id);

const buttonRadius = (shape: StorefrontButtonShape) => (shape === "square" ? "8px" : "9999px");

const HERO_TOKENS: Record<StorefrontHeroVariant, (preset: StorefrontPreset) => string> = {
  band: ({ ink, page }) => `--sf-hero-bg:${ink};--sf-hero-fg:${page};`,
  tint: ({ ink }) => `--sf-hero-bg:color-mix(in oklab,var(--primary) 10%,white);--sf-hero-fg:${ink};`,
  centered: ({ ink }) => `--sf-hero-bg:transparent;--sf-hero-fg:${ink};`,
};

const buttonTokens = ({ button, ink }: StorefrontPreset) =>
  button === "pill-outline"
    ? `--sf-button-bg:transparent;--sf-button-fg:${ink};--sf-button-border:${ink};`
    : "--sf-button-bg:var(--primary);--sf-button-fg:var(--primary-foreground);--sf-button-border:transparent;";

const addButtonTokens = ({ addButton, ink }: StorefrontPreset) => {
  if (addButton === "ink") return `--sf-add-bg:${ink};--sf-add-fg:var(--primary);--sf-add-border:${ink};`;
  if (addButton === "outline") return `--sf-add-bg:transparent;--sf-add-fg:${ink};--sf-add-border:${ink};`;
  return "--sf-add-bg:var(--primary);--sf-add-fg:var(--primary-foreground);--sf-add-border:transparent;";
};

export function storefrontPresetCss(): string {
  return STOREFRONT_PRESETS.map((preset) => {
    const marker = `[data-storefront-preset="${preset.id}"]`;
    const declarations =
      `--sf-page:${preset.page};--sf-ink:${preset.ink};--sf-card-radius:${preset.cardRadius};` +
      `--sf-button-radius:${buttonRadius(preset.button)};--sf-font-display:${preset.displayFont};` +
      `--sf-display-weight:${preset.displayWeight};--sf-font-body:${preset.bodyFont};` +
      `--sf-font-price:${preset.priceFont};--sf-price-weight:${preset.priceWeight};` +
      HERO_TOKENS[preset.hero](preset) +
      buttonTokens(preset) +
      addButtonTokens(preset);
    return `${marker},:root:has(${marker}){${declarations}}[data-storefront-preset="${preset.id}"]{font-family:var(--sf-font-body);}`;
  }).join("");
}
