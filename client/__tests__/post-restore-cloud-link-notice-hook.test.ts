import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression tests for known bug #10, Part B's React wiring
 * (lib/hooks/use-post-restore-cloud-link-notice.ts): the pure gating logic
 * lives in lib/utils/post-restore-notice.ts (see
 * __tests__/post-restore-notice.test.ts) - this covers the hook that
 * actually surfaces the one-time toast on mount, wired into both
 * post-restore landing spots (/login and the dashboard shell).
 */

const toastWarningMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarningMock(...args),
  },
}));

describe("usePostRestoreCloudLinkNotice", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  async function mount(onLinkCloud: () => void) {
    const { usePostRestoreCloudLinkNotice } = await import(
      "@/lib/hooks/use-post-restore-cloud-link-notice"
    );
    function Harness() {
      usePostRestoreCloudLinkNotice({ onLinkCloud });
      return null;
    }
    act(() => {
      root.render(React.createElement(Harness));
    });
  }

  it("shows a toast pointing to the cloud-link control when just-restored and not cloud-linked", async () => {
    sessionStorage.setItem("dumos_just_restored", "1");
    const onLinkCloud = vi.fn();

    await mount(onLinkCloud);

    expect(toastWarningMock).toHaveBeenCalledTimes(1);
    const [, options] = toastWarningMock.mock.calls[0];
    expect(options.action.onClick).toBeTypeOf("function");
    options.action.onClick();
    expect(onLinkCloud).toHaveBeenCalledTimes(1);
  });

  it("does not show a toast when the device is cloud-linked after the restore", async () => {
    sessionStorage.setItem("dumos_just_restored", "1");
    localStorage.setItem("auth_token", "fake-token");

    await mount(vi.fn());

    expect(toastWarningMock).not.toHaveBeenCalled();
  });

  it("does not show a toast on a normal page load (no restore flag)", async () => {
    await mount(vi.fn());

    expect(toastWarningMock).not.toHaveBeenCalled();
  });

  it("only shows the toast once even if the component re-renders", async () => {
    sessionStorage.setItem("dumos_just_restored", "1");
    let onLinkCloud = vi.fn();

    const { usePostRestoreCloudLinkNotice } = await import(
      "@/lib/hooks/use-post-restore-cloud-link-notice"
    );
    function Harness({ cb }: { cb: () => void }) {
      usePostRestoreCloudLinkNotice({ onLinkCloud: cb });
      return null;
    }

    act(() => {
      root.render(React.createElement(Harness, { cb: onLinkCloud }));
    });
    act(() => {
      // Re-render with a new callback identity - must not re-fire.
      root.render(React.createElement(Harness, { cb: vi.fn() }));
    });

    expect(toastWarningMock).toHaveBeenCalledTimes(1);
  });
});
