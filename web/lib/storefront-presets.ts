export type StorefrontPresetId = "workshop" | "clinic" | "studio" | "market" | "boutique" | "grove";
export type StorefrontHeroVariant = "band" | "tint" | "centered";
export type StorefrontButtonShape = "square" | "pill" | "pill-outline";
export type StorefrontAddButton = "accent" | "outline";

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
    addButton: "accent",
    cardRadius: "10px",
    displayFont: `"Archivo", ${SANS_FALLBACK}`,
    displayWeight: 800,
    bodyFont: `"IBM Plex Sans", ${SANS_FALLBACK}`,
    priceFont: `"IBM Plex Mono", ui-monospace, monospace`,
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
    displayFont: `"Figtree", ${SANS_FALLBACK}`,
    displayWeight: 800,
    bodyFont: `"Figtree", ${SANS_FALLBACK}`,
    priceFont: `"Figtree", ${SANS_FALLBACK}`,
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
    displayFont: `"Fraunces", Georgia, serif`,
    displayWeight: 500,
    bodyFont: `"DM Sans", ${SANS_FALLBACK}`,
    priceFont: `"DM Sans", ${SANS_FALLBACK}`,
    priceWeight: 500,
  },
  {
    id: "market",
    label: "Market",
    page: "#F4F7FB",
    ink: "#0B1F3A",
    accent: "#1D4ED8",
    hero: "band",
    button: "pill",
    addButton: "accent",
    cardRadius: "12px",
    displayFont: `"Archivo", ${SANS_FALLBACK}`,
    displayWeight: 700,
    bodyFont: `"Figtree", ${SANS_FALLBACK}`,
    priceFont: `"Figtree", ${SANS_FALLBACK}`,
    priceWeight: 800,
  },
  {
    id: "boutique",
    label: "Boutique",
    page: "#FBF4F6",
    ink: "#2A1520",
    accent: "#B4235A",
    hero: "centered",
    button: "square",
    addButton: "outline",
    cardRadius: "0px",
    displayFont: `"Fraunces", Georgia, serif`,
    displayWeight: 600,
    bodyFont: `"Figtree", ${SANS_FALLBACK}`,
    priceFont: `"Figtree", ${SANS_FALLBACK}`,
    priceWeight: 600,
  },
  {
    id: "grove",
    label: "Grove",
    page: "#F3F7F1",
    ink: "#16241A",
    accent: "#2F7D3A",
    hero: "tint",
    button: "pill",
    addButton: "accent",
    cardRadius: "20px",
    displayFont: `"DM Sans", ${SANS_FALLBACK}`,
    displayWeight: 700,
    bodyFont: `"DM Sans", ${SANS_FALLBACK}`,
    priceFont: `"DM Sans", ${SANS_FALLBACK}`,
    priceWeight: 700,
  },
];

const PRESETS_BY_ID: ReadonlyMap<string, StorefrontPreset> = new Map(
  STOREFRONT_PRESETS.map((preset) => [preset.id, preset]),
);

export const getStorefrontPreset = (id: string): StorefrontPreset | undefined => PRESETS_BY_ID.get(id);

const buttonRadius = (shape: StorefrontButtonShape) => (shape === "square" ? "8px" : "9999px");

type Tokens = Record<string, string>;

const HERO_TOKENS: Record<StorefrontHeroVariant, (preset: StorefrontPreset) => Tokens> = {
  band: ({ ink, page }) => ({ "--sf-hero-bg": ink, "--sf-hero-fg": page }),
  tint: ({ ink }) => ({
    "--sf-hero-bg": "color-mix(in oklab,var(--primary) 10%,white)",
    "--sf-hero-fg": ink,
  }),
  centered: ({ ink }) => ({ "--sf-hero-bg": "transparent", "--sf-hero-fg": ink }),
};

const buttonTokens = ({ button, ink }: StorefrontPreset): Tokens =>
  button === "pill-outline"
    ? { "--sf-button-bg": "transparent", "--sf-button-fg": ink, "--sf-button-border": ink }
    : {
        "--sf-button-bg": "var(--primary)",
        "--sf-button-fg": "var(--primary-foreground)",
        "--sf-button-border": "transparent",
      };

const addButtonTokens = ({ addButton, ink }: StorefrontPreset): Tokens => {
  if (addButton === "outline") return { "--sf-add-bg": "transparent", "--sf-add-fg": ink, "--sf-add-border": ink };
  return { "--sf-add-bg": "var(--primary)", "--sf-add-fg": "var(--primary-foreground)", "--sf-add-border": "transparent" };
};

export function storefrontPresetVars(preset: StorefrontPreset): Tokens {
  return {
    "--sf-page": preset.page,
    "--sf-ink": preset.ink,
    "--sf-card-radius": preset.cardRadius,
    "--sf-button-radius": buttonRadius(preset.button),
    "--sf-font-display": preset.displayFont,
    "--sf-display-weight": String(preset.displayWeight),
    "--sf-font-body": preset.bodyFont,
    "--sf-font-price": preset.priceFont,
    "--sf-price-weight": String(preset.priceWeight),
    ...HERO_TOKENS[preset.hero](preset),
    ...buttonTokens(preset),
    ...addButtonTokens(preset),
  };
}

export function storefrontPresetCss(): string {
  return STOREFRONT_PRESETS.map((preset) => {
    const marker = `[data-storefront-preset="${preset.id}"]`;
    const declarations = Object.entries(storefrontPresetVars(preset))
      .map(([name, value]) => `${name}:${value};`)
      .join("");
    return `${marker},:root:has(${marker}){${declarations}}${marker}{font-family:var(--sf-font-body);}`;
  }).join("");
}
