import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("useWidgetDeeplink", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("routes to the path carried by a widget-deeplink CustomEvent's detail", async () => {
    const { useWidgetDeeplink } = await import("@/lib/hooks/use-widget-deeplink");
    renderHook(() => useWidgetDeeplink());

    window.dispatchEvent(
      new CustomEvent("widget-deeplink", { detail: "/inventory/catalog?filter=low_stock" }),
    );

    expect(pushMock).toHaveBeenCalledWith("/inventory/catalog?filter=low_stock");
  });

  it("ignores events with a non-string detail", async () => {
    const { useWidgetDeeplink } = await import("@/lib/hooks/use-widget-deeplink");
    renderHook(() => useWidgetDeeplink());

    window.dispatchEvent(new CustomEvent("widget-deeplink", { detail: 42 }));

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("stops listening after unmount", async () => {
    const { useWidgetDeeplink } = await import("@/lib/hooks/use-widget-deeplink");
    const { unmount } = renderHook(() => useWidgetDeeplink());
    unmount();

    window.dispatchEvent(
      new CustomEvent("widget-deeplink", { detail: "/inventory/catalog?filter=low_stock" }),
    );

    expect(pushMock).not.toHaveBeenCalled();
  });
});
