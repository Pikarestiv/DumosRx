import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

vi.mock("next/font/local", () => ({
  default: ({ variable }: { variable: string }) => ({ variable }),
}));

import { DOWNLOAD_URL, WEB_APP_URL } from "@/lib/constants";
import { FALLBACK_RELEASE_LINKS } from "@/lib/api/release-hooks";
import { metadata } from "@/app/layout";

const ROOT = path.resolve(__dirname, "..");
const SCANNED_DIRS = ["app", "components", "hooks"];
const HARDCODED = /https:\/\/(downloads\.)?dumosrx\.com/;

const sourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
};

describe("configurable domains come from constants.ts (A-104)", () => {
  it("exposes the download fallbacks off DOWNLOAD_URL", () => {
    for (const platform of ["windows", "macos", "linux", "android"] as const) {
      expect(FALLBACK_RELEASE_LINKS[platform]).toBe(DOWNLOAD_URL);
    }
  });

  it("leaves no hardcoded dumosrx.com literal in app/components/hooks", () => {
    const offenders = SCANNED_DIRS.flatMap((dir) =>
      sourceFiles(path.join(ROOT, dir)),
    ).filter((file) => HARDCODED.test(readFileSync(file, "utf8")));

    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("builds the site metadata URLs from WEB_APP_URL", () => {
    expect(metadata.openGraph?.url).toBe(WEB_APP_URL);
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: `${WEB_APP_URL}/og-image.jpg` }),
    ]);
    expect(metadata.twitter?.images).toEqual([`${WEB_APP_URL}/og-image.jpg`]);
    expect(WEB_APP_URL.startsWith("http")).toBe(true);
  });
});
