export const MIN_TEXT_CONTRAST = 4.5;

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const WHITE = "#ffffff";

export interface ReadableForeground {
  foreground: string;
  contrast: number;
  readable: boolean;
}

export const isHexColour = (value: unknown): value is string =>
  typeof value === "string" && HEX_COLOUR.test(value);

function linear(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => linear(parseInt(hex.slice(start, start + 2), 16)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export function readableForeground(accent: string, ink: string): ReadableForeground {
  const onWhite = contrastRatio(WHITE, accent);
  if (onWhite >= MIN_TEXT_CONTRAST) {
    return { foreground: WHITE, contrast: onWhite, readable: true };
  }
  const onInk = contrastRatio(ink, accent);
  return { foreground: ink, contrast: onInk, readable: onInk >= MIN_TEXT_CONTRAST };
}
