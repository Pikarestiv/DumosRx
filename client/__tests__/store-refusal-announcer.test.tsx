import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { StoreRefusal } from "@/lib/db/sync-engine/store-refusal";
import { storeRefusalRemedy } from "@/lib/utils/store-refusal-remedy";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toastError = vi.fn();
const switchStore = vi.fn();
let fixedStoreId: string | undefined;

vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));
vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => ({ user: { store_id: fixedStoreId } }) }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ switchStore }) }));

const MESSAGE = "Sync is paused.";
const refusal = (storeId: string, names: string[]): StoreRefusal => ({
  storeId,
  accessibleStores: names.map((name) => ({ id: `id-${name}`, name })),
});

describe("storeRefusalRemedy (A-323)", () => {
  it("offers the one store left to switch to", () => {
    expect(storeRefusalRemedy(refusal("b", ["C"]), false)).toEqual({
      message: "Switch to C to keep syncing.",
      switchTo: { id: "id-C", name: "C" },
    });
  });

  it("points at the store menu when several stores are left", () => {
    expect(storeRefusalRemedy(refusal("b", ["C", "D"]), false).switchTo).toBeNull();
    expect(storeRefusalRemedy(refusal("b", ["C", "D"]), false).message).toMatch(/store menu/);
  });

  it("asks for access back when no store is left", () => {
    expect(storeRefusalRemedy(refusal("b", []), false)).toEqual({
      message: "Ask the store owner to restore your access to keep syncing.",
      switchTo: null,
    });
  });

  it("tells a staff member with a fixed store to sign in again, since switching cannot move them", () => {
    expect(storeRefusalRemedy(refusal("b", ["C"]), true)).toEqual({
      message: "Sign out and sign in again to load the store you now work at.",
      switchTo: null,
    });
  });
});

describe("useStoreRefusalAnnouncer (A-323)", () => {
  let announcer: ReturnType<typeof import("@/lib/hooks/use-store-refusal-announcer").useStoreRefusalAnnouncer>;

  async function mount() {
    const { useStoreRefusalAnnouncer } = await import("@/lib/hooks/use-store-refusal-announcer");
    function Probe() {
      announcer = useStoreRefusalAnnouncer();
      return null;
    }
    await act(() => {
      createRoot(document.createElement("div")).render(<Probe />);
    });
  }

  beforeEach(() => {
    toastError.mockReset();
    switchStore.mockReset();
    fixedStoreId = undefined;
  });

  it("toasts once per refused store on background syncs, with an action that switches store", async () => {
    await mount();

    expect(announcer.announce(refusal("b", ["C"]), MESSAGE, false)).toBe(`${MESSAGE} Switch to C to keep syncing.`);
    announcer.announce(refusal("b", ["C"]), MESSAGE, false);

    expect(toastError).toHaveBeenCalledTimes(1);
    const options = toastError.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
    expect(options.action.label).toBe("Switch to C");
    options.action.onClick();
    expect(switchStore).toHaveBeenCalledWith("id-C");
  });

  it("toasts again on a manual sync and after a successful round resets it", async () => {
    await mount();

    announcer.announce(refusal("b", ["C"]), MESSAGE, false);
    announcer.announce(refusal("b", ["C"]), MESSAGE, true);
    announcer.reset();
    announcer.announce(refusal("b", ["C"]), MESSAGE, false);

    expect(toastError).toHaveBeenCalledTimes(3);
  });

  it("offers no switch to a staff member with a fixed store", async () => {
    fixedStoreId = "b";
    await mount();

    announcer.announce(refusal("b", ["C"]), MESSAGE, false);

    expect((toastError.mock.calls[0][1] as { action?: unknown }).action).toBeUndefined();
  });
});
