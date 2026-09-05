import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression coverage for a real user report: "Logged in normally but I'm
 * seeing impersonation mode at the top." Root cause: the banner's only
 * signal is a localStorage flag (impersonator_handoff_return_code) written
 * once by app/auth/callback/page.tsx when a superadmin's impersonation
 * handoff lands, and previously cleared in exactly one place — a
 * successful click of the banner's own "End Session" button. A normal
 * logout, a crash, or just closing the impersonated tab left it behind
 * forever; any later ordinary PIN login on that same device/browser — by
 * anyone — then showed a permanent "Impersonation Mode" banner.
 *
 * This test covers the other half of the fix: even a successful *click* of
 * "End Session" couldn't actually clear the flag if the stored return code
 * had already expired or been used (both realistic — it's explicitly
 * single-use and short-lived), because the failure path never removed it.
 * That left an even worse dead end: a banner whose only action always
 * failed, forever. The corresponding auth-context.tsx fix (clearing the
 * same flag on every ordinary login/logout path) isn't covered here since
 * those paths require mocking most of the local-database layer; this
 * covers the fully self-contained half.
 */

const consumeHandoffCodeMock = vi.fn();
const createHandoffCodeMock = vi.fn();
const clearTokenMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    consumeHandoffCode: (...args: unknown[]) => consumeHandoffCodeMock(...args),
    createHandoffCode: (...args: unknown[]) => createHandoffCodeMock(...args),
    clearToken: (...args: unknown[]) => clearTokenMock(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
  },
}));

const RETURN_CODE_KEY = "impersonator_handoff_return_code";

describe("ImpersonationBanner", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    consumeHandoffCodeMock.mockReset();
    createHandoffCodeMock.mockReset();
    clearTokenMock.mockReset();
    toastErrorMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
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

  it("clears the stale flag and dismisses itself when the return code has expired", async () => {
    localStorage.setItem(RETURN_CODE_KEY, "expired-code");
    consumeHandoffCodeMock.mockRejectedValue(new Error("Code expired or already used"));

    await renderBanner();

    expect(container.textContent).toContain("Impersonation Mode");

    const endSessionButton = container.querySelector("button");
    expect(endSessionButton).not.toBeNull();

    await act(async () => {
      endSessionButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(localStorage.getItem(RETURN_CODE_KEY)).toBeNull();
    expect(container.textContent).not.toContain("Impersonation Mode");
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it("does not render at all when no return code is stored", async () => {
    await renderBanner();
    expect(container.textContent).not.toContain("Impersonation Mode");
  });
});
