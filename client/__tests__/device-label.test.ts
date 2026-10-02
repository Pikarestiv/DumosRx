import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/core", () => ({
  isTauri: vi.fn().mockReturnValue(false),
}));

import { isTauri } from "@/lib/db/core";
import { getDeviceLabel } from "../lib/utils/device-label";

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

describe("getDeviceLabel", () => {
  beforeEach(() => {
    vi.mocked(isTauri).mockReturnValue(false);
  });

  it("identifies Chrome on Windows", () => {
    setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(getDeviceLabel()).toBe("Chrome on Windows");
  });

  it("identifies Safari on iOS", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(getDeviceLabel()).toBe("Safari on iOS");
  });

  it("identifies Firefox on Linux", () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0");
    expect(getDeviceLabel()).toBe("Firefox on Linux");
  });

  it("labels a Tauri desktop app distinctly from its underlying browser engine", () => {
    vi.mocked(isTauri).mockReturnValue(true);
    setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(getDeviceLabel()).toBe("Desktop App (Windows)");
  });

  it("falls back gracefully for an unrecognized browser/OS combination", () => {
    setUserAgent("SomeUnknownAgent/1.0");
    expect(getDeviceLabel()).toBe("a browser on an unknown OS");
  });
});
