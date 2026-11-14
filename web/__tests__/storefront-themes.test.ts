import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { contrastRatio as hexContrastRatio } from "@/lib/storefront-accent";
import { STOREFRONT_PRESETS, storefrontPresetVars } from "@/lib/storefront-presets";
import {
  DEFAULT_STOREFRONT_THEME_ID,
  STOREFRONT_THEMES,
  resolveStorefrontPreset,
  resolveStorefrontTheme,
  storefrontAccentCss,
  storefrontThemeCss,
} from "@/lib/storefront-themes";

function parseOklch(value: string): [number, number, number] {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`Not a plain oklch() colour: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function relativeLuminance(value: string): number {
  const [l, c, h] = parseOklch(value);
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ];
  const [L, M, S] = lms;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const red = clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S);
  const green = clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S);
  const blue = clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(x: string, y: string): number {
  if (x.startsWith("#") && y.startsWith("#")) return hexContrastRatio(x, y);
  const [hi, lo] = [relativeLuminance(x), relativeLuminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

const repoFile = (path: string) => readFileSync(resolve(__dirname, "..", "..", path), "utf8");

describe("storefront theme registry", () => {
  it("measures black on white at the WCAG maximum, so the contrast maths can be trusted", () => {
    expect(contrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 1);
  });

  it.each(STOREFRONT_THEMES.map((theme) => [theme.id, theme] as const))(
    "%s keeps button text readable on its primary colour in light and dark mode",
    (_id, theme) => {
      expect(contrastRatio(theme.light.primaryForeground, theme.light.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.dark.primaryForeground, theme.dark.primary)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("the default theme carries exactly today's globals.css colours, so existing stores do not change", () => {
    const css = repoFile("web/app/globals.css");
    const defaults = resolveStorefrontTheme(DEFAULT_STOREFRONT_THEME_ID);
    const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
    const darkBlock = css.slice(css.indexOf(".dark {"));

    expect(rootBlock).toContain(`--primary: ${defaults.light.primary};`);
    expect(rootBlock).toContain(`--primary-foreground: ${defaults.light.primaryForeground};`);
    expect(rootBlock).toContain(`--ring: ${defaults.light.ring};`);
    expect(darkBlock).toContain(`--primary: ${defaults.dark.primary};`);
    expect(darkBlock).toContain(`--primary-foreground: ${defaults.dark.primaryForeground};`);
    expect(darkBlock).toContain(`--ring: ${defaults.dark.ring};`);
  });

  it("emits no override for the default theme, and page-wide rules for every other so portalled dialogs match", () => {
    const css = storefrontThemeCss();

    expect(css).not.toContain(`"${DEFAULT_STOREFRONT_THEME_ID}"`);
    for (const theme of STOREFRONT_THEMES.filter((t) => t.id !== DEFAULT_STOREFRONT_THEME_ID)) {
      const marker = `[data-storefront-theme="${theme.id}"]`;
      expect(css).toContain(`:root:has(${marker}){--primary:${theme.light.primary};`);
      expect(css).toContain(`.dark:has(${marker}){--primary:${theme.dark.primary};`);
    }
  });

  it.each([undefined, null, "", "neon", "__proto__"])("falls back to the default theme for %s", (id) => {
    expect(resolveStorefrontTheme(id).id).toBe(DEFAULT_STOREFRONT_THEME_ID);
  });

  it("offers exactly the theme ids the server accepts", () => {
    const php = repoFile("laravel-server/app/Support/StorefrontThemes.php");
    const serverList = /public const IDS = \[([^\]]*)\]/.exec(php)?.[1] ?? "";
    const serverIds = [...serverList.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

    expect(serverIds).toEqual(STOREFRONT_THEMES.map((theme) => theme.id));
  });

  it.each(STOREFRONT_PRESETS.map((preset) => [preset.id, preset] as const))(
    "%s keeps its ink readable on its page background",
    (_id, preset) => {
      expect(hexContrastRatio(preset.ink, preset.page)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("storefront preset resolution", () => {
  it("maps a legacy accent theme to the preset that fits the store type", () => {
    expect(resolveStorefrontPreset("emerald", "pharmacy").id).toBe("clinic");
    expect(resolveStorefrontPreset("navy", "hardware").id).toBe("workshop");
    expect(resolveStorefrontPreset("rose", null).id).toBe("workshop");
  });

  it("an explicitly assigned preset wins over the store type", () => {
    expect(resolveStorefrontPreset("studio", "pharmacy").id).toBe("studio");
    expect(resolveStorefrontPreset("workshop", "pharmacy").id).toBe("workshop");
  });

  it.each([undefined, null, "", "neon", "__proto__"])("falls back to workshop for an unknown theme %s", (id) => {
    expect(resolveStorefrontPreset(id, "hardware").id).toBe("workshop");
  });
});

describe("storefront accent override", () => {
  const workshop = resolveStorefrontPreset("workshop");

  it("overrides the primary colour with a readable foreground chosen automatically", () => {
    const css = storefrontAccentCss("#F2B705", workshop);

    expect(css).toContain("--primary:#F2B705;");
    expect(css).toContain(`--primary-foreground:${workshop.ink};`);
    expect(storefrontAccentCss("#0F6B58", workshop)).toContain("--primary-foreground:#ffffff;");
  });

  it.each([undefined, null, "", "red", "#fff", "#12345g", "#F2B705;}body{display:none"])(
    "emits nothing for the unusable accent %s",
    (accent) => {
      expect(storefrontAccentCss(accent, workshop)).toBe("");
    },
  );
});

describe("add-to-cart button colours", () => {
  it.each(STOREFRONT_PRESETS.map((preset) => [preset.id] as const))(
    "%s never puts the accent on a background it was not checked against",
    (id) => {
      const vars = storefrontPresetVars(STOREFRONT_PRESETS.find((preset) => preset.id === id)!);

      if (vars["--sf-add-bg"] === "var(--primary)") expect(vars["--sf-add-fg"]).toBe("var(--primary-foreground)");
      else expect(vars["--sf-add-fg"]).not.toContain("--primary)");
    },
  );
});
