import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const { auth, mutateAsync } = vi.hoisted(() => ({
  auth: { user: { role: "store_owner" }, isCloudLinked: true, isImpersonating: false },
  mutateAsync: vi.fn(),
}));

vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ activeStoreId: "store-1" }) }));
vi.mock("@/lib/hooks/use-sessions", () => ({
  useGenerateRelinkCodeMutation: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RelinkCodeDialog, formatCountdown } from "@/components/settings/account/relink-code-dialog";

describe("RelinkCodeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { role: "store_owner" };
    auth.isImpersonating = false;
  });

  it("formats the countdown as m:ss", () => {
    expect(formatCountdown(15 * 60 * 1000)).toBe("15:00");
    expect(formatCountdown(61_500)).toBe("1:02");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("is hidden from staff and impersonation sessions", () => {
    auth.user = { role: "manager" };
    const { container, rerender } = render(<RelinkCodeDialog />);
    expect(container.innerHTML).toBe("");

    auth.user = { role: "store_owner" };
    auth.isImpersonating = true;
    rerender(<RelinkCodeDialog />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the generated code once with its DD/MM/YYYY HH:mm expiry", async () => {
    mutateAsync.mockResolvedValue({ code: "ABCD2345", expires_at: "2099-01-02T03:04:00" });
    render(<RelinkCodeDialog />);

    fireEvent.click(screen.getByRole("button", { name: /Generate till re-link code/ }));

    expect((await screen.findByTestId("relink-code-value")).textContent).toContain("ABCD2345");
    expect(mutateAsync).toHaveBeenCalledWith("store-1");
    expect(screen.getByText(/\(at 02\/01\/2099 03:04\)/)).toBeTruthy();
  });
});
