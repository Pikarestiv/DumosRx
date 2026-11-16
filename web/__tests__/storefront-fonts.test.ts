import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { storefrontDisplayFontUrl, storefrontFontFaceCss } from "@/lib/storefront-fonts";
import { STOREFRONT_PRESETS } from "@/lib/storefront-presets";

const fileFor = (url: string) => resolve(__dirname, "..", "public", url.replace(/^\//, ""));

describe("storefront preset fonts", () => {
  it("declares only the fonts the active preset uses, so a store never downloads another preset's faces", () => {
    const clinic = storefrontFontFaceCss(["clinic"]);

    expect(clinic).toContain('font-family:"Figtree"');
    expect(clinic).not.toContain("Archivo");
    expect(clinic).not.toContain("Fraunces");
  });

  it("declares every face once when several presets are shown together, as in the admin preview", () => {
    const css = storefrontFontFaceCss(STOREFRONT_PRESETS.map((preset) => preset.id));

    for (const family of ["Archivo", "IBM Plex Sans", "IBM Plex Mono", "Figtree", "Fraunces", "DM Sans"]) {
      expect(css.split(`font-family:"${family}"`)).toHaveLength(2);
    }
  });

  it.each(STOREFRONT_PRESETS.map((preset) => [preset.id] as const))(
    "%s preloads a font file that exists and that its own @font-face rules serve",
    (id) => {
      const url = storefrontDisplayFontUrl(id);

      expect(existsSync(fileFor(url))).toBe(true);
      expect(storefrontFontFaceCss([id])).toContain(`url(${url})`);
    },
  );

  it("references only files that are shipped in public/store-fonts", () => {
    const urls = [...storefrontFontFaceCss(STOREFRONT_PRESETS.map((preset) => preset.id)).matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);

    expect(urls).toHaveLength(6);
    for (const url of urls) expect(existsSync(fileFor(url))).toBe(true);
  });
});
