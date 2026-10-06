import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * A-158: app/globals.css has a compat shim (`@supports not (color: color-mix(...))`)
 * that forces low-opacity utilities on theme-CSS-variable colors (primary,
 * destructive, etc.) to fully transparent on browsers without color-mix()
 * support (e.g. Chrome <111 / Windows 7) - without it, those utilities
 * silently fall back to a SOLID, full-opacity color, which can collide with
 * same-color foreground text/icons and make them invisible.
 *
 * The shim's selector list only ever listed bare tokens like
 * "hover:bg-primary/10". Several components style their inactive/hover tab
 * or filter-chip state with the *compound* variant
 * "data-[state=inactive]:hover:bg-primary/10" - a different literal class
 * string - so they slipped past the shim entirely (found live: a tab's and
 * a filter chip's label text disappearing on hover, since the un-mitigated
 * fallback made the "10% tint" solid, full-opacity primary blue behind
 * equally-blue hover text).
 *
 * Rather than pinning this to one file, this scans every .tsx file under
 * components/ and app/ for the pattern, so any current or future file using
 * this compound variant is covered the same way, not just the ones known
 * at the time of the fix.
 */
describe("globals.css compat shim covers every compound-variant opacity utility in the app", () => {
  function listTsxFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listTsxFiles(full);
      return entry.name.endsWith(".tsx") ? [full] : [];
    });
  }

  it("has a transparent override for every data-[state=inactive]:hover:(bg|border)-<theme-color>/<=40 token used anywhere", () => {
    const root = path.join(__dirname, "..");
    const dirs = ["components", "app"].map((d) => path.join(root, d));
    const files = dirs.flatMap(listTsxFiles);
    expect(files.length).toBeGreaterThan(0);

    const globalsCss = fs.readFileSync(path.join(root, "app/globals.css"), "utf-8");
    const tokenPattern =
      /data-\[state=inactive\]:hover:(bg|border)-(primary|destructive|accent|muted|sidebar-accent)(-foreground)?\/(\d+)/g;

    const missing: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf-8");
      for (const match of source.matchAll(tokenPattern)) {
        const [fullToken, , , , opacity] = match;
        if (Number(opacity) > 40) continue;
        if (!globalsCss.includes(`[class~="${fullToken}"]`)) {
          missing.push(`${fullToken} (${path.relative(root, file)})`);
        }
      }
    }

    expect(missing, `missing compat-shim overrides:\n${missing.join("\n")}`).toEqual([]);
  });
});
