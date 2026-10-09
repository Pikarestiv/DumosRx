import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TillCodesCard } from "@/components/admin/views/till-codes-card";
import type { AdminTillCode } from "@/lib/api/admin-hooks-till-codes";

const { state } = vi.hoisted(() => ({
  state: {
    codes: [] as AdminTillCode[],
    issued: "123456789012",
    revoked: [] as string[],
  },
}));

vi.mock("@/lib/api/admin-hooks-till-codes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/admin-hooks-till-codes")>();
  return {
    ...actual,
    useMyTillCodes: () => ({ data: { codes: state.codes }, isLoading: false }),
    useIssueTillCodeMutation: () => ({
      mutateAsync: async () => ({ id: "c-new", code: state.issued }),
      isPending: false,
    }),
    useRevokeTillCodeMutation: () => ({
      mutateAsync: async (id: string) => {
        state.revoked.push(id);
        return { ok: true };
      },
      isPending: false,
    }),
  };
});

const code = (overrides: Partial<AdminTillCode> = {}): AdminTillCode => ({
  id: "c1",
  label: "Agidi branch",
  last_used_at: null,
  created_at: "2026-10-09T10:00:00Z",
  ...overrides,
});

describe("TillCodesCard", () => {
  beforeEach(() => {
    state.codes = [];
    state.revoked = [];
  });

  it("invites the admin to generate one when none exist", () => {
    render(<TillCodesCard />);

    expect(screen.getByText(/no active codes/i)).toBeInTheDocument();
  });

  it("never renders the code itself in the list", () => {
    state.codes = [code({ last_used_at: "2026-10-09T12:00:00Z" })];
    render(<TillCodesCard />);

    expect(screen.getByText("Agidi branch")).toBeInTheDocument();
    expect(screen.queryByText(/123456789012/)).not.toBeInTheDocument();
  });

  it("shows a generated code once, in a dialog that must be dismissed", async () => {
    render(<TillCodesCard />);

    await userEvent.click(screen.getByRole("button", { name: /generate code/i }));

    await waitFor(() =>
      expect(screen.getByText("123456789012")).toBeInTheDocument(),
    );
    expect(screen.getByText(/not shown again/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /written it down/i }));

    await waitFor(() =>
      expect(screen.queryByText("123456789012")).not.toBeInTheDocument(),
    );
  });

  it("refuses a fourth code rather than letting the server reject it", () => {
    state.codes = [code({ id: "a" }), code({ id: "b" }), code({ id: "c" })];
    render(<TillCodesCard />);

    expect(screen.getByRole("button", { name: /generate code/i })).toBeDisabled();
    expect(screen.getByText(/3 active codes is the maximum/i)).toBeInTheDocument();
  });

  it("revokes behind a confirmation rather than immediately", async () => {
    state.codes = [code()];
    render(<TillCodesCard />);

    await userEvent.click(screen.getByRole("button", { name: /^revoke$/i }));

    expect(state.revoked).toEqual([]);

    await waitFor(() =>
      expect(screen.getByText(/stops working immediately/i)).toBeInTheDocument(),
    );
    // Two buttons now read "Revoke": the row's trigger and the dialog's
    // confirm. The confirm is the later one in the tree.
    const confirms = screen.getAllByRole("button", { name: /^revoke$/i });
    await userEvent.click(confirms[confirms.length - 1]);

    await waitFor(() => expect(state.revoked).toEqual(["c1"]));
  });

  it("formats dates as DD/MM/YYYY, never the US order", () => {
    state.codes = [code({ created_at: "2026-10-09T10:00:00Z" })];
    render(<TillCodesCard />);

    expect(screen.getByText(/09\/10\/2026/)).toBeInTheDocument();
  });
});
