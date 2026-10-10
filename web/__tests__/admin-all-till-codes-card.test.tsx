import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AllTillCodesCard } from "@/components/admin/views/all-till-codes-card";
import type { AdminTillCodeReveal } from "@/lib/api/admin-hooks-till-codes";

const { state } = vi.hoisted(() => ({
  state: {
    role: "super_admin",
    codes: [] as AdminTillCodeReveal[],
    enabledWith: [] as boolean[],
  },
}));

vi.mock("@/lib/store/use-admin-auth-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/store/use-admin-auth-store")>();
  return {
    ...actual,
    useAdminAuthStore: (selector: (s: unknown) => unknown) =>
      selector({ user: { role: state.role } }),
  };
});

vi.mock("@/lib/api/admin-hooks-till-codes", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/admin-hooks-till-codes")>();
  return {
    ...actual,
    useAllTillCodes: (enabled: boolean) => {
      state.enabledWith.push(enabled);
      return {
        data: enabled ? { codes: state.codes } : undefined,
        isLoading: false,
        error: null,
      };
    },
  };
});

const reveal = (overrides: Partial<AdminTillCodeReveal> = {}): AdminTillCodeReveal => ({
  id: "c1",
  label: "Agidi branch",
  admin_email: "ops@dumosrx.com",
  admin_name: "Ops Lead",
  created_at: "2026-10-09T10:00:00Z",
  last_used_at: null,
  code: "123456789012",
  ...overrides,
});

describe("AllTillCodesCard", () => {
  beforeEach(() => {
    state.role = "super_admin";
    state.codes = [reveal()];
    state.enabledWith = [];
  });

  it("renders nothing at all for a platform admin", () => {
    state.role = "platform_admin";
    const { container } = render(<AllTillCodesCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it("does not fetch any code until the super admin asks for them", () => {
    render(<AllTillCodesCard />);

    expect(state.enabledWith.every((enabled) => enabled === false)).toBe(true);
    expect(screen.queryByText("123456789012")).not.toBeInTheDocument();
  });

  it("shows every admin's code with its owner once revealed", async () => {
    render(<AllTillCodesCard />);

    await userEvent.click(screen.getByRole("button", { name: /reveal/i }));

    await waitFor(() => expect(screen.getByText("123456789012")).toBeInTheDocument());
    expect(screen.getByText(/ops@dumosrx.com/)).toBeInTheDocument();
  });

  it("marks a code issued before codes were recoverable as unavailable", async () => {
    state.codes = [reveal({ code: null, label: "legacy" })];
    render(<AllTillCodesCard />);

    await userEvent.click(screen.getByRole("button", { name: /reveal/i }));

    await waitFor(() => expect(screen.getByText("Unavailable")).toBeInTheDocument());
    expect(screen.queryByText("123456789012")).not.toBeInTheDocument();
  });

  it("warns that a reveal is audited", () => {
    render(<AllTillCodesCard />);

    expect(screen.getByText(/activity log/i)).toBeInTheDocument();
  });
});
