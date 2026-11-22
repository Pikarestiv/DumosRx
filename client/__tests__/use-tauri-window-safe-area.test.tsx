import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTauriWindow } from "@/components/tauri/use-tauri-window";

describe("useTauriWindow safe-area variables", () => {
  beforeEach(() => {
    document.body.style.removeProperty("--tauri-top");
    document.body.style.removeProperty("--tauri-bottom");
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("sets env() safe-area insets in web/PWA mode instead of forcing 0px", async () => {
    renderHook(() => useTauriWindow());

    await waitFor(() => {
      expect(document.body.style.getPropertyValue("--tauri-top")).toBe(
        "env(safe-area-inset-top, 0px)",
      );
      expect(document.body.style.getPropertyValue("--tauri-bottom")).toBe(
        "env(safe-area-inset-bottom, 0px)",
      );
    });
  });

  it("sets desktop 40px top inset when running on desktop Tauri", async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    vi.doMock("@tauri-apps/api/window", () => ({
      getCurrentWindow: () => ({
        isMaximized: vi.fn(async () => false),
        onResized: vi.fn(async () => () => {}),
      }),
    }));
    vi.doMock("@tauri-apps/plugin-os", () => ({
      type: () => "macos",
    }));

    const { useTauriWindow: useMockedTauriWindow } = await import(
      "@/components/tauri/use-tauri-window"
    );
    renderHook(() => useMockedTauriWindow());

    await waitFor(() => {
      expect(document.body.style.getPropertyValue("--tauri-top")).toBe("40px");
      expect(document.body.style.getPropertyValue("--tauri-bottom")).toBe("0px");
    });

    vi.doUnmock("@tauri-apps/api/window");
    vi.doUnmock("@tauri-apps/plugin-os");
  });
});
