import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression coverage for two issues in this banner's "End Session" button:
 *
 * 1. (Original bug this file covered) A real user report: "Logged in
 *    normally but I'm seeing impersonation mode at the top." Root cause:
 *    the banner's only signal is a localStorage flag
 *    (impersonator_handoff_return_code) written once by
 *    app/auth/callback/page.tsx when a superadmin's impersonation handoff
 *    lands. A normal logout, a crash, or just closing the impersonated tab
 *    left it behind forever; any later ordinary PIN login on that same
 *    device/browser then showed a permanent "Impersonation Mode" banner.
 *    The corresponding auth-context.tsx fix (clearing the same flag on
 *    every ordinary login/logout path) isn't covered here since those
 *    paths require mocking most of the local-database layer; this covers
 *    the fully self-contained half (dismissing when no flag is present).
 *
 * 2. (docs/KNOWN_BUGS.md M4) The stored return code is a one-time,
 *    60-SECOND-lived handoff code minted back when impersonation *started*
 *    — every admin who spent more than a minute impersonating (the normal
 *    case, not an edge case) previously hit a "session expired" dead end on
 *    click, because "End Session" tried to redeem that stale code. Fixed
 *    to rely on the admin's own independent, long-lived HttpOnly refresh
 *    cookie instead: clicking "End Session" now navigates straight to
 *    /admin with no code redemption at all, regardless of how long
 *    impersonation lasted.
 */

const clearTokenMock = vi.fn();

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    consumeHandoffCode: vi.fn(),
    createHandoffCode: vi.fn(),
    clearToken: (...args: unknown[]) => clearTokenMock(...args),
  },
}));

const RETURN_CODE_KEY = "impersonator_handoff_return_code";
const IMPERSONATED_USER_KEY = "dumos_impersonated_user";

describe("ImpersonationBanner", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalLocation: Location;

  beforeEach(() => {
    localStorage.clear();
    clearTokenMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);

    // jsdom throws "Not implemented: navigation" on a real
    // `window.location.href` assignment - replace it with a plain object
    // so the assignment can be observed instead.
    originalLocation = window.location;
    // @ts-expect-error - deliberately replacing a read-only global for the test
    delete window.location;
    (window as any).location = { href: "" };
  });

  afterEach(() => {
    (window as any).location = originalLocation;
  });

  async function renderBanner() {
    const { ImpersonationBanner } = await import(
      "@/components/dashboard/impersonation-banner"
    );
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(ImpersonationBanner));
    });
  }

  it("End Session navigates straight to /admin with no handoff-code redemption, regardless of the stored code's validity", async () => {
    localStorage.setItem(RETURN_CODE_KEY, "some-code-that-may-well-be-expired-by-now");
    localStorage.setItem(IMPERSONATED_USER_KEY, JSON.stringify({ id: "u1" }));

    const { apiClient } = await import("@/lib/api/client");

    await renderBanner();

    const endSessionButton = container.querySelector("button");
    expect(endSessionButton).not.toBeNull();

    act(() => {
      endSessionButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(apiClient.consumeHandoffCode).not.toHaveBeenCalled();
    expect(apiClient.createHandoffCode).not.toHaveBeenCalled();
    expect(clearTokenMock).toHaveBeenCalled();
    expect(localStorage.getItem(RETURN_CODE_KEY)).toBeNull();
    expect(localStorage.getItem(IMPERSONATED_USER_KEY)).toBeNull();
    expect(window.location.href).toContain("/admin");
  });

  it("does not render at all when no return code is stored", async () => {
    await renderBanner();
    expect(container.textContent).not.toContain("Impersonation Mode");
  });
});
