import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SCANNED_DIRS = ["app/admin", "components/admin"];

/** Phase 1 removed every figure the admin panel invented rather than measured.
 * Each pattern below is a literal that actually shipped; see
 * docs/superpowers/specs/2026-10-06-admin-panel-phase-1-design.md. */
const FABRICATIONS: Array<{ label: string; pattern: RegExp }> = [
  { label: "hardcoded 42ms latency", pattern: /["']42ms["']/ },
  { label: "optimistic 100% sync fallback", pattern: /\|\|\s*['"]100%['"]/ },
  { label: "hardcoded performance badge", pattern: /High Performance/ },
  { label: "placeholder status-page toast", pattern: /Status Page Pending/ },
  { label: "non-existent WebSocket metric", pattern: /WebSocket/ },
  { label: "retired Global Inventory stat", pattern: /Global Inventory/ },
];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });

describe("admin metrics carry no fabricated literals (Phase 1)", () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)));

  it("scans a non-empty set of admin files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const { label, pattern } of FABRICATIONS) {
    it(`leaves no ${label}`, () => {
      const offenders = files
        .filter((file) => pattern.test(readFileSync(file, "utf8")))
        .map((file) => path.relative(ROOT, file));

      expect(offenders).toEqual([]);
    });
  }
});
