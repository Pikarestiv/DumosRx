export interface StorefrontThemePalette {
  primary: string;
  primaryForeground: string;
  ring: string;
}

export interface StorefrontTheme {
  id: string;
  label: string;
  light: StorefrontThemePalette;
  dark: StorefrontThemePalette;
}

export const DEFAULT_STOREFRONT_THEME_ID = "emerald";

const WHITE = "oklch(1 0 0)";
const INK = "oklch(0.15 0 0)";

const palette = (primary: string, primaryForeground: string): StorefrontThemePalette => ({
  primary,
  primaryForeground,
  ring: primary,
});

export const STOREFRONT_THEMES: readonly StorefrontTheme[] = [
  {
    id: DEFAULT_STOREFRONT_THEME_ID,
    label: "Default",
    light: { primary: "oklch(0.55 0.18 250)", primaryForeground: WHITE, ring: "oklch(0.708 0 0)" },
    dark: { primary: "oklch(0.65 0.15 250)", primaryForeground: "oklch(0.1 0 0)", ring: "oklch(0.556 0 0)" },
  },
  {
    id: "forest",
    label: "Forest",
    light: palette("oklch(0.5 0.13 160)", WHITE),
    dark: palette("oklch(0.72 0.14 160)", INK),
  },
  {
    id: "navy",
    label: "Navy",
    light: palette("oklch(0.38 0.11 260)", WHITE),
    dark: palette("oklch(0.72 0.1 260)", INK),
  },
  {
    id: "rose",
    label: "Rose",
    light: palette("oklch(0.52 0.19 10)", WHITE),
    dark: palette("oklch(0.74 0.14 10)", INK),
  },
  {
    id: "amber",
    label: "Amber",
    light: palette("oklch(0.5 0.11 60)", WHITE),
    dark: palette("oklch(0.8 0.15 75)", INK),
  },
  {
    id: "slate",
    label: "Slate",
    light: palette("oklch(0.4 0.03 255)", WHITE),
    dark: palette("oklch(0.76 0.03 255)", INK),
  },
  {
    id: "violet",
    label: "Violet",
    light: palette("oklch(0.5 0.2 295)", WHITE),
    dark: palette("oklch(0.74 0.13 295)", INK),
  },
];

export function resolveStorefrontTheme(id?: string | null): StorefrontTheme {
  return STOREFRONT_THEMES.find((theme) => theme.id === id) ?? STOREFRONT_THEMES[0];
}

const declarations = ({ primary, primaryForeground, ring }: StorefrontThemePalette) =>
  `--primary:${primary};--primary-foreground:${primaryForeground};--ring:${ring};`;

export function storefrontThemeCss(): string {
  return STOREFRONT_THEMES.filter((theme) => theme.id !== DEFAULT_STOREFRONT_THEME_ID)
    .map((theme) => {
      const marker = `[data-storefront-theme="${theme.id}"]`;
      const light = `${marker},:root:has(${marker})`;
      const dark = `.dark ${marker},.dark:has(${marker})`;
      return `${light}{${declarations(theme.light)}}${dark}{${declarations(theme.dark)}}`;
    })
    .join("");
}
