import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { apiClient } from "../lib/api/client";
import { setToken, clearToken } from "../lib/api/token-manager";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A-213: the endpoint refuses with 410 and is not coming back until the
 * `opening_quantity` work lands, so the UI must stop advertising it. The code
 * path itself stays — only the invitation goes.
 */
describe("Settings > Data no longer offers Health Sync", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
  });

  async function render() {
    const { DataSettingsSyncMaintenance } = await import(
      "@/components/settings/data-settings-sync-maintenance"
    );
    root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(DataSettingsSyncMaintenance, {
          handleForceFullResync: vi.fn(),
        }),
      );
    });
  }

  it("still offers Force Full Resync", async () => {
    await render();
    expect(container.textContent).toContain("Force Full Resync");
  });

  it("shows no Health Sync card, button or description", async () => {
    await render();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/health sync/i);
    expect(text).not.toMatch(/in agreement with/i);
    expect(text).not.toMatch(/double-checks every detail/i);
  });

  it("no longer exposes a handler for it from useSettingsSync", async () => {
    const mod = await import("@/hooks/use-settings-sync");
    expect(Object.keys(mod)).toContain("useSettingsSync");
    const src = mod.useSettingsSync.toString();
    expect(src).not.toMatch(/handleReconcileStockQuantities/);
  });

  it("keeps the DevTools hook and the underlying function", async () => {
    const engine = await import("@/lib/db/sync-engine");
    expect(typeof engine.reconcileStockQuantities).toBe("function");
  });
});

describe("A deliberate 410 refusal is not reported as a client error", () => {
  const originalFetch = global.fetch;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    global.fetch = vi.fn(async (url: unknown, init?: any) => {
      const href = String(url);
      calls.push(href);
      if (href.includes("/logs/client-error")) {
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}) } as never;
      }
      return {
        ok: false,
        status: href.includes("reconcile-quantities") ? 410 : 500,
        headers: { get: () => "application/json" },
        json: async () => ({ message: "Health Sync has been retired." }),
      } as never;
    }) as unknown as typeof fetch;
    setToken("tok");
    localStorage.removeItem("auth_token_issued_at");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearToken();
  });

  it("does not POST a 410 to /logs/client-error", async () => {
    await expect(
      apiClient.reconcileStockQuantities({ batches: [] }),
    ).rejects.toThrow();

    expect(calls.some((c) => c.includes("/logs/client-error"))).toBe(false);
  });

  it("still reports a genuine 500", async () => {
    await expect(apiClient.getSyncCounts()).rejects.toThrow();

    expect(calls.some((c) => c.includes("/logs/client-error"))).toBe(true);
  });
});
