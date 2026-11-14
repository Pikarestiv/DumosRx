import type { StorefrontPresetId } from "@/lib/storefront-presets";

interface FontFile {
  family: string;
  file: string;
  weight: string;
}

const FONTS = {
  archivo: { family: "Archivo", file: "archivo-latin-wght-normal.woff2", weight: "100 900" },
  plexSans: { family: "IBM Plex Sans", file: "ibm-plex-sans-latin-wght-normal.woff2", weight: "100 700" },
  plexMono: { family: "IBM Plex Mono", file: "ibm-plex-mono-latin-600-normal.woff2", weight: "600" },
  figtree: { family: "Figtree", file: "figtree-latin-wght-normal.woff2", weight: "300 900" },
  fraunces: { family: "Fraunces", file: "fraunces-latin-wght-normal.woff2", weight: "100 900" },
  dmSans: { family: "DM Sans", file: "dm-sans-latin-wght-normal.woff2", weight: "100 1000" },
} satisfies Record<string, FontFile>;

type FontKey = keyof typeof FONTS;

const PRESET_FONTS: Record<StorefrontPresetId, { display: FontKey; faces: FontKey[] }> = {
  workshop: { display: "archivo", faces: ["archivo", "plexSans", "plexMono"] },
  clinic: { display: "figtree", faces: ["figtree"] },
  studio: { display: "fraunces", faces: ["fraunces", "dmSans"] },
};

const fontUrl = ({ file }: FontFile) => `/store-fonts/${file}`;

export function storefrontFontFaceCss(presets: readonly StorefrontPresetId[]): string {
  const keys = new Set(presets.flatMap((id) => PRESET_FONTS[id].faces));
  return [...keys]
    .map((key) => {
      const font = FONTS[key];
      return `@font-face{font-family:"${font.family}";src:url(${fontUrl(font)}) format("woff2");font-weight:${font.weight};font-display:swap;}`;
    })
    .join("");
}

export function storefrontDisplayFontUrl(preset: StorefrontPresetId): string {
  return fontUrl(FONTS[PRESET_FONTS[preset].display]);
}
