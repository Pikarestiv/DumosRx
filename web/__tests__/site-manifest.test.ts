import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "--font-mock" }),
}));

import { metadata } from "@/app/layout";

describe("site.webmanifest configuration", () => {
  const manifestPath = path.resolve(__dirname, "../public/site.webmanifest");

  it("declares an explicit id, start_url, and scope set to '/'", () => {
    const raw = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);

    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.start_url).not.toBe("/dashboard");
    expect(manifest.display).toBe("standalone");
  });

  it("is linked from root layout metadata", () => {
    expect(metadata.manifest).toBe("/site.webmanifest");
  });
});
