import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// A-158: app/globals.css has a compat shim (`@supports not (color:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-tabs-hover-compat-shim-coverage-test-ts-L5
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
