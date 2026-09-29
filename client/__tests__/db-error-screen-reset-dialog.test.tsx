import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

/**
 * Regression coverage for A-14 (docs/KNOWN_BUGS.md), UI half: the recovery
 * button used the native `window.confirm`, which `.agents/AGENTS.md` §9
 * forbids, and its handler never touched the IndexedDB database.
 */

const discardLocalDatabaseBlob = vi.fn(async () => ({ backedUp: true }));

vi.mock("@/lib/db/local-database", () => ({
  initDatabase: vi.fn(async () => {
    throw new Error("database is locked");
  }),
  isTauri: () => false,
  isWriterTab: () => true,
  onWriterTabChange: () => () => {},
  onPromotionFailed: () => () => {},
  requestWriterHandoff: vi.fn(),
  forceWriterTakeover: vi.fn(),
  discardLocalDatabaseBlob,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("DatabaseProvider's init-error recovery screen", () => {
  let DatabaseProvider: typeof import("@/lib/db/DatabaseProvider").DatabaseProvider;
  const reload = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.setItem("auth_token", "tok");
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    ({ DatabaseProvider } = await import("@/lib/db/DatabaseProvider"));
  });

  async function renderErrorScreen() {
    render(<DatabaseProvider>child</DatabaseProvider>);
    await screen.findByText("Database Error");
  }

  it("does not use the native window.confirm", async () => {
    const confirmSpy = vi.fn(() => true);
    window.confirm = confirmSpy;

    await renderErrorScreen();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset App Data" }));
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
  });

  it("does nothing at all when the confirmation dialog is cancelled", async () => {
    await renderErrorScreen();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset App Data" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    });

    expect(discardLocalDatabaseBlob).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(localStorage.getItem("auth_token")).toBe("tok");
  });

  it("deletes the IndexedDB database, not just localStorage, once confirmed", async () => {
    await renderErrorScreen();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset App Data" }));
    });

    const dialog = await screen.findByRole("alertdialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Reset App Data",
    )!;
    await act(async () => {
      fireEvent.click(confirm);
    });

    await waitFor(() => expect(discardLocalDatabaseBlob).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(reload).toHaveBeenCalled();
  });

  it("keeps the session rather than wiping it for nothing when the database could not be cleared", async () => {
    discardLocalDatabaseBlob.mockRejectedValueOnce(new Error("blocked"));

    await renderErrorScreen();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset App Data" }));
    });

    const dialog = await screen.findByRole("alertdialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Reset App Data",
    )!;
    await act(async () => {
      fireEvent.click(confirm);
    });

    await waitFor(() => expect(discardLocalDatabaseBlob).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("auth_token")).toBe("tok");
    expect(reload).not.toHaveBeenCalled();
  });
});
