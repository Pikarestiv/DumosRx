import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Regression coverage for two issues in this banner's "End Session" button:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-impersonation-banner-stale-flag-test-ts-L7

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

    // jsdom throws "Not implemented:
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-impersonation-banner-stale-flag-test-ts-L58
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
