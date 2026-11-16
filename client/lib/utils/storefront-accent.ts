export const MIN_TEXT_CONTRAST = 4.5;

export const ACCENT_SWATCHES = [
  "#F2B705",
  "#0F6B58",
  "#1F3A8A",
  "#B4234F",
  "#B45309",
  "#475569",
  "#6D28D9",
  "#7A4252",
] as const;

export const PRESET_DEFAULTS = {
  workshop: { ink: "#141412", accent: "#F2B705" },
  clinic: { ink: "#0E2A25", accent: "#0F6B58" },
  studio: { ink: "#33232A", accent: "#7A4252" },
} as const;

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

export const isHexColour = (value: string): boolean => HEX_COLOUR.test(value);

function linear(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    linear(parseInt(hex.slice(start, start + 2), 16)),
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

export function readableTextOn(
  accent: string,
  ink: string,
): { contrast: number; readable: boolean } {
  const onWhite = contrastRatio("#ffffff", accent);
  if (onWhite >= MIN_TEXT_CONTRAST)
    return { contrast: onWhite, readable: true };
  const onInk = contrastRatio(ink, accent);
  return { contrast: onInk, readable: onInk >= MIN_TEXT_CONTRAST };
}
