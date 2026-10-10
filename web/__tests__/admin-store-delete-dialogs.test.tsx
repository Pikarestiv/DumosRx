import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ArchiveStoreDialog,
  PurgeStoreDialog,
} from "@/components/admin/stores/store-delete-dialogs";
import { StoreRowActions } from "@/components/admin/stores/store-row-actions";
import type { AdminStoreSummary } from "@/lib/types/admin";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

const store: AdminStoreSummary = {
  id: "8f1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
  name: "Duplicate Test Store",
  owner: "Ada Owner",
  email: "ada@dumosrx.com",
  plan: "free",
  status: "Active",
  date: "Jan 02, 2026",
};

const noop = () => undefined;

const rowActionHandlers = {
  handleImpersonate: noop,
  handleViewBilling: noop,
  setSelectedStore: noop,
  setIsSuspendDialogOpen: noop,
  setIsTrialDialogOpen: noop,
  setIsActivatePlanDialogOpen: noop,
  handleUnsuspend: noop,
  handleToggleDemo: noop,
  handleArchive: noop,
  handleRestore: noop,
  handlePurge: noop,
};

describe("PurgeStoreDialog typed confirmation", () => {
  it("keeps the delete button disabled until the exact phrase is typed", () => {
    const onConfirm = vi.fn();
    render(
      <PurgeStoreDialog store={store} onOpenChange={noop} onConfirm={onConfirm} isPending={false} />,
    );

    const button = screen.getByRole("button", { name: "Delete Forever" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "dumosrx" } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "DumosRx " } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "DumosRx" } });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith("DumosRx");
  });

  it("clears the typed phrase when it is pointed at another store", () => {
    const { rerender } = render(
      <PurgeStoreDialog store={store} onOpenChange={noop} onConfirm={noop} isPending={false} />,
    );

    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "DumosRx" } });
    expect(screen.getByRole("button", { name: "Delete Forever" })).toBeEnabled();

    rerender(
      <PurgeStoreDialog
        store={{ ...store, id: "another-store-id" }}
        onOpenChange={noop}
        onConfirm={noop}
        isPending={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Delete Forever" })).toBeDisabled();
  });
});

describe("ArchiveStoreDialog", () => {
  it("confirms with the optional internal reason", () => {
    const onConfirm = vi.fn();
    render(
      <ArchiveStoreDialog
        store={store}
        onOpenChange={noop}
        onConfirm={onConfirm}
        isPending={false}
      />,
    );

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: " duplicate " } });
    fireEvent.click(screen.getByRole("button", { name: "Archive Store" }));

    expect(onConfirm).toHaveBeenCalledWith("duplicate");
  });
});

describe("StoreRowActions destructive entries", () => {
  const renderActions = (isSuperAdmin: boolean, overrides: Partial<AdminStoreSummary> = {}) =>
    render(
      <StoreRowActions
        store={{ ...store, ...overrides }}
        isSuperAdmin={isSuperAdmin}
        canGrantTrials={isSuperAdmin}
        canImpersonate={isSuperAdmin}
        canManageAccountStatus={isSuperAdmin}
        pendingStoreId={null}
        router={{ push: vi.fn() } as unknown as AppRouterInstance}
        {...rowActionHandlers}
      />,
    );

  const openMenu = async () => {
    await userEvent.click(screen.getByRole("button", { name: /actions for/i }));
    await screen.findByText("View Store Details");
  };

  it("offers archive and permanent delete to a super admin", async () => {
    renderActions(true);
    await openMenu();

    expect(screen.getByText("Archive Store")).toBeInTheDocument();
    expect(screen.getByText("Delete Permanently")).toBeInTheDocument();
  });

  it("offers restore instead of archive for an archived store", async () => {
    renderActions(true, { is_archived: true });
    await openMenu();

    expect(screen.getByText("Restore Store")).toBeInTheDocument();
    expect(screen.queryByText("Archive Store")).not.toBeInTheDocument();
  });

  it("hides both destructive entries from a non super admin", async () => {
    renderActions(false);
    await openMenu();

    expect(screen.queryByText("Archive Store")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete Permanently")).not.toBeInTheDocument();
  });
});

describe("StoreRowActions trigger variants", () => {
  const renderTrigger = (trigger?: "icon" | "labelled") =>
    render(
      <StoreRowActions
        store={store}
        isSuperAdmin
        canGrantTrials
        canImpersonate
        canManageAccountStatus
        pendingStoreId={null}
        trigger={trigger}
        router={{ push: vi.fn() } as unknown as AppRouterInstance}
        {...rowActionHandlers}
      />,
    );

  /** The store detail page needs a visible control, not a bare kebab, but it
   * opens the same menu — so the label is the only difference. */
  it("labels the trigger on request and keeps the same accessible name", () => {
    renderTrigger("labelled");

    expect(screen.getByRole("button", { name: /actions for/i }).textContent).toContain("Actions");
  });

  it("stays a bare icon by default, as the fleet row needs", () => {
    renderTrigger();

    expect(screen.getByRole("button", { name: /actions for/i }).textContent).toBe("");
  });

  /** The detail page's own menu should not offer to navigate to the page it
   * is already on. */
  it("omits View Store Details when it is already on the store detail page", async () => {
    render(
      <StoreRowActions
        store={store}
        isSuperAdmin
        canGrantTrials
        canImpersonate
        canManageAccountStatus
        pendingStoreId={null}
        trigger="labelled"
        onStoreDetailPage
        router={{ push: vi.fn() } as unknown as AppRouterInstance}
        {...rowActionHandlers}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /actions for/i }));
    await screen.findByText("Archive Store");
    expect(screen.queryByText("View Store Details")).not.toBeInTheDocument();
  });

  it("keeps View Store Details everywhere else", async () => {
    renderTrigger("icon");

    await userEvent.click(screen.getByRole("button", { name: /actions for/i }));
    expect(await screen.findByText("View Store Details")).toBeInTheDocument();
  });
});
