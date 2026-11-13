import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const logout = vi.fn();
const push = vi.fn();
let queued = 0;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => ({ logout }) }));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canUseAiAssistant: true, withRestriction: (fn: () => void) => fn }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQuery: () => ({ data: queued }),
}));
vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

import { useAccountActions } from "@/lib/hooks/use-account-actions";
import { AccountExitDialog } from "@/components/dashboard/unsynced-logout-dialog";
import { useStockAuditDraftStore } from "@/lib/hooks/use-stock-audit-draft";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";

function AccountMenu() {
  const { navActions, exitDialog } = useAccountActions({ onClose: () => {} });
  return (
    <>
      {navActions.map((a) => (
        <button key={a.key} onClick={a.onClick}>
          {a.label}
        </button>
      ))}
      <AccountExitDialog {...exitDialog} />
    </>
  );
}

function stageCount(counted: boolean) {
  useStockAuditDraftStore.setState({
    activeStoreId: "store-a",
    loadedStoreId: "store-a",
    items: [{ id: "p", name: "Amoxil", sku: "A", category: "c", systemQty: 5, ...(counted ? { countedQty: 3, counted: true } : {}) }],
    drafts: {},
  });
}

describe("signing out or switching user with a cycle count in progress", () => {
  beforeEach(() => {
    logout.mockClear();
    push.mockClear();
    queued = 0;
    useAutoLockStore.setState({ isLocked: false, forceAccountSelection: false });
  });

  it("warns before a full logout, says the count is kept, and keeps it after confirming", async () => {
    stageCount(true);
    render(<AccountMenu />);

    fireEvent.click(screen.getByRole("button", { name: "Log out completely" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/count is in progress/i);
    expect(dialog.textContent).toMatch(/saved on this device/i);
    expect(dialog.textContent).toMatch(/another till can take/i);
    expect(logout).not.toHaveBeenCalled();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    });
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("warns before Switch Account and only locks once confirmed", async () => {
    stageCount(true);
    render(<AccountMenu />);

    fireEvent.click(screen.getByRole("button", { name: "Switch Account" }));

    expect((await screen.findByRole("dialog")).textContent).toMatch(/count is in progress/i);
    expect(useAutoLockStore.getState().isLocked).toBe(false);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^switch account$/i }));
    });
    expect(useAutoLockStore.getState().forceAccountSelection).toBe(true);
  });

  it("switches straight away when nothing has been counted", () => {
    stageCount(false);
    render(<AccountMenu />);

    fireEvent.click(screen.getByRole("button", { name: "Switch Account" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useAutoLockStore.getState().forceAccountSelection).toBe(true);
  });

  it("logs out straight away with no count and nothing queued", () => {
    stageCount(false);
    render(<AccountMenu />);

    fireEvent.click(screen.getByRole("button", { name: "Log out completely" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
