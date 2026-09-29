import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A-13. The Tauri webview shipped with `csp: null` and `withGlobalTauri:
 * true`, so any script injection in the webview would have run with every
 * granted capability (`sql:allow-*`, `fs:allow-read-file`,
 * `fs:allow-copy-file`, `dialog:*`, `shell:default`) and `window.__TAURI__`
 * in scope. This pins the policy so it cannot silently regress to null, and
 * pins the specific sources the app genuinely needs — each one is there
 * because something in the client actually loads it.
 */
const config = JSON.parse(
  readFileSync(resolve(__dirname, "../src-tauri/tauri.conf.json"), "utf8"),
) as {
  app: {
    security: { csp: string | null };
    withGlobalTauri?: boolean;
  };
};

function directive(name: string): string[] {
  const csp = config.app.security.csp;
  expect(typeof csp).toBe("string");
  const found = (csp as string)
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  expect(found, `CSP has no ${name} directive`).toBeDefined();
  return (found as string).split(/\s+/).slice(1);
}

describe("tauri.conf.json content security policy", () => {
  it("sets a real CSP instead of null", () => {
    expect(config.app.security.csp).not.toBeNull();
    expect(typeof config.app.security.csp).toBe("string");
    expect((config.app.security.csp as string).length).toBeGreaterThan(0);
  });

  it("defaults to self and forbids plugins and framing outright", () => {
    expect(directive("default-src")).toEqual(["'self'"]);
    expect(directive("object-src")).toEqual(["'none'"]);
    expect(directive("frame-src")).toEqual(["'none'"]);
    expect(directive("base-uri")).toEqual(["'self'"]);
    expect(directive("form-action")).toEqual(["'self'"]);
  });

  it("never allows remote or inline script execution", () => {
    const scriptSrc = directive("script-src");

    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc.some((source) => source.startsWith("http"))).toBe(false);
  });

  it("allows wasm-unsafe-eval, which sql.js needs to instantiate sql-wasm.wasm", () => {
    expect(directive("script-src")).toContain("'wasm-unsafe-eval'");
  });

  it("allows inline styles, which the chart component and Radix inject at runtime", () => {
    const styleSrc = directive("style-src");

    expect(styleSrc).toContain("'self'");
    expect(styleSrc).toContain("'unsafe-inline'");
  });

  it("allows blob: workers, which the PDF report generator spawns", () => {
    const workerSrc = directive("worker-src");

    expect(workerSrc).toContain("'self'");
    expect(workerSrc).toContain("blob:");
  });

  it("allows blob: and data: images, which receipts and barcodes render as", () => {
    const imgSrc = directive("img-src");

    expect(imgSrc).toContain("'self'");
    expect(imgSrc).toContain("data:");
    expect(imgSrc).toContain("blob:");
  });

  it("lets the app reach the Tauri IPC channel and its own API hosts", () => {
    const connectSrc = directive("connect-src");

    expect(connectSrc).toContain("'self'");
    // Tauri v2's IPC is ipc://localhost on macOS/Linux and
    // http://ipc.localhost on Windows/Android.
    expect(connectSrc).toContain("ipc:");
    expect(connectSrc).toContain("http://ipc.localhost");
    // The API host is configurable at runtime (ServerSelector), and the
    // Android emulator/local-dev entries are plain http.
    expect(connectSrc).toContain("https:");
  });

  it("drops withGlobalTauri — nothing in the client reads window.__TAURI__ on its own", () => {
    expect(config.app.withGlobalTauri).toBeUndefined();
  });
});
