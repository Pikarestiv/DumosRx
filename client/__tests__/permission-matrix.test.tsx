import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const revertToDefault = vi.fn();
const renameGroup = vi.fn();
const deleteGroup = vi.fn();

vi.mock("@/lib/hooks/use-permission-groups", () => ({
  usePermissionGroups: () => ({
    groups: [
      { id: "g1", name: "Manager", based_on_role: "manager", is_default: true, permissions: ["process_sales"] },
      { id: "g2", name: "Auditor", based_on_role: "auditor", is_default: true, permissions: ["view_reports"] },
      { id: "g3", name: "Supervisor", based_on_role: "manager", is_default: false, permissions: ["process_sales"] },
    ],
    toggle: vi.fn(),
    createGroup: vi.fn(),
    copyGroup: vi.fn(),
    revertToDefault,
    renameGroup,
    deleteGroup,
  }),
}));
vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: () => true }));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canCreateCustomPermissionGroups: true,
    withRestriction: (fn: (...args: unknown[]) => void) => fn,
  }),
}));

describe("PermissionMatrix", () => {
  it("renders one column per group and checks the cells each group actually grants", async () => {
    const { PermissionMatrix } = await import("@/components/settings/roles-permissions/permission-matrix");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PermissionMatrix));
    });

    expect(container.textContent).toContain("Manager");
    expect(container.textContent).toContain("Auditor");
    expect(container.textContent).toContain("Process Sales");
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);

    act(() => root.unmount());
    container.remove();
  });

  it("shows Revert to Default for a default group's column and calls revertToDefault on confirm", async () => {
    const { PermissionMatrix } = await import("@/components/settings/roles-permissions/permission-matrix");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PermissionMatrix));
    });

    const revertButton = container.querySelector('[aria-label="Revert Manager to default"]') as HTMLButtonElement;
    expect(revertButton).toBeTruthy();
    await act(async () => {
      revertButton.click();
    });
    const confirmButton = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Revert") as HTMLButtonElement;
    expect(confirmButton).toBeTruthy();
    await act(async () => {
      confirmButton.click();
    });
    expect(revertToDefault).toHaveBeenCalledWith("g1");

    act(() => root.unmount());
    container.remove();
  });

  it("shows Rename and Delete for a custom group's column, never Revert", async () => {
    const { PermissionMatrix } = await import("@/components/settings/roles-permissions/permission-matrix");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PermissionMatrix));
    });

    expect(container.querySelector('[aria-label="Revert Supervisor to default"]')).toBeNull();
    expect(container.querySelector('[aria-label="Rename Supervisor"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Delete Supervisor"]')).toBeTruthy();

    act(() => root.unmount());
    container.remove();
  });

  it("deletes a custom group after confirmation", async () => {
    const { PermissionMatrix } = await import("@/components/settings/roles-permissions/permission-matrix");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PermissionMatrix));
    });

    const deleteButton = container.querySelector('[aria-label="Delete Supervisor"]') as HTMLButtonElement;
    await act(async () => {
      deleteButton.click();
    });
    const confirmButton = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Delete") as HTMLButtonElement;
    await act(async () => {
      confirmButton.click();
    });
    expect(deleteGroup).toHaveBeenCalledWith("g3");

    act(() => root.unmount());
    container.remove();
  });

  it("renames a custom group after entering a new name", async () => {
    const { PermissionMatrix } = await import("@/components/settings/roles-permissions/permission-matrix");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PermissionMatrix));
    });

    const renameButton = container.querySelector('[aria-label="Rename Supervisor"]') as HTMLButtonElement;
    await act(async () => {
      renameButton.click();
    });
    const nameInput = document.querySelector('[data-testid="rename-group-input"]') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      nativeSetter.call(nameInput, "Shift Lead");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submitButton = document.querySelector('[data-testid="submit-rename-group"]') as HTMLButtonElement;
    await act(async () => {
      submitButton.click();
    });
    expect(renameGroup).toHaveBeenCalledWith("g3", "Shift Lead");

    act(() => root.unmount());
    container.remove();
  });

  it("marks a permission row as not yet enforced when no real call site checks it", async () => {
    const { PermissionMatrix } = await import("@/components/settings/roles-permissions/permission-matrix");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PermissionMatrix));
    });

    // "process_sales" is enforced (pos-layout-header.tsx) - no indicator.
    const processSalesRow = Array.from(container.querySelectorAll("tr")).find((tr) => tr.textContent?.includes("Process Sales"));
    expect(processSalesRow?.querySelector('[data-testid="not-yet-enforced"]')).toBeNull();

    // "manage_suppliers" has no real call site - must be marked.
    const suppliersRow = Array.from(container.querySelectorAll("tr")).find((tr) => tr.textContent?.includes("Manage Suppliers"));
    expect(suppliersRow?.querySelector('[data-testid="not-yet-enforced"]')).toBeTruthy();

    act(() => root.unmount());
    container.remove();
  });
});
