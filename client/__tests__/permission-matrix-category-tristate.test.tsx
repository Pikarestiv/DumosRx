import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PERMISSION_CATALOG } from "@/lib/constants/permissions";
import {
  getCategoryCheckState,
  getCategoryToggleKeys,
  getCategoryToggleTarget,
} from "@/components/settings/roles-permissions/category-selection";

const toggleMany = vi.fn();

const salesKeys = PERMISSION_CATALOG.filter((p) => p.category === "Sales & POS").map((p) => p.key);
const inventoryKeys = PERMISSION_CATALOG.filter((p) => p.category === "Inventory & Stock").map((p) => p.key);

vi.mock("@/lib/hooks/use-permission-groups", () => ({
  usePermissionGroups: () => ({
    groups: [
      // All of Sales & POS, none of Inventory & Stock.
      { id: "g1", name: "Full Sales", based_on_role: "manager", is_default: true, permissions: salesKeys },
      // Exactly one Sales & POS key - the partial case.
      { id: "g2", name: "Partial", based_on_role: "manager", is_default: true, permissions: ["process_sales"] },
      // Nothing at all.
      { id: "g3", name: "Empty", based_on_role: "auditor", is_default: true, permissions: [] },
    ],
    toggle: vi.fn(),
    toggleMany,
    createGroup: vi.fn(),
    copyGroup: vi.fn(),
    revertToDefault: vi.fn(),
    renameGroup: vi.fn(),
    deleteGroup: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
  // Owner-tier caller: the server's grant check short-circuits for them, so
  // no cell is ever locked by the "can't grant what you don't hold" rule.
  useOwnGrantScope: () => ({ unrestricted: true, ownPermissions: [] }),
  useOwnPermissionGroupId: () => null,
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canCreateCustomPermissionGroups: true,
    withRestriction: (fn: (...args: unknown[]) => void) => fn,
  }),
}));

describe("category tri-state maths", () => {
  it("reports checked only when every key in the category is granted", () => {
    expect(getCategoryCheckState(["a", "b"], ["a", "b"])).toBe("checked");
    expect(getCategoryCheckState(["a", "b"], ["a"])).toBe("indeterminate");
    expect(getCategoryCheckState(["a", "b"], [])).toBe("unchecked");
    expect(getCategoryCheckState(["a", "b"], ["z"])).toBe("unchecked");
  });

  it("fills in from unchecked or indeterminate and clears from checked", () => {
    expect(getCategoryToggleTarget("unchecked")).toBe(true);
    expect(getCategoryToggleTarget("indeterminate")).toBe(true);
    expect(getCategoryToggleTarget("checked")).toBe(false);
  });

  it("never writes a locked key", () => {
    expect(getCategoryToggleKeys(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });
});

async function renderMatrix() {
  const { PermissionMatrix } = await import("@/components/settings/roles-permissions/permission-matrix");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(PermissionMatrix));
  });
  return { container, root };
}

const categoryBox = (container: HTMLElement, category: string, groupName: string) =>
  Array.from(container.querySelectorAll('input[data-testid="category-checkbox"]')).find(
    (i) => i.getAttribute("aria-label") === `${category} - all permissions - ${groupName}`,
  ) as HTMLInputElement;

describe("PermissionMatrix category rows", () => {
  beforeEach(() => {
    toggleMany.mockClear();
  });

  it("shows a checked, indeterminate and unchecked category box per group state", async () => {
    const { container, root } = await renderMatrix();

    const full = categoryBox(container, "Sales & POS", "Full Sales");
    expect(full.checked).toBe(true);
    expect(full.indeterminate).toBe(false);

    const partial = categoryBox(container, "Sales & POS", "Partial");
    expect(partial.checked).toBe(false);
    expect(partial.indeterminate).toBe(true);

    const empty = categoryBox(container, "Sales & POS", "Empty");
    expect(empty.checked).toBe(false);
    expect(empty.indeterminate).toBe(false);

    // A group with none of a category's keys is unchecked, not indeterminate.
    expect(categoryBox(container, "Inventory & Stock", "Full Sales").indeterminate).toBe(false);

    act(() => root.unmount());
    container.remove();
  });

  it("grants every child key when an indeterminate category box is clicked", async () => {
    const { container, root } = await renderMatrix();
    const partial = categoryBox(container, "Sales & POS", "Partial");
    await act(async () => {
      partial.click();
    });
    expect(toggleMany).toHaveBeenCalledWith("g2", salesKeys, true);

    act(() => root.unmount());
    container.remove();
  });

  it("clears every child key when a fully checked category box is clicked", async () => {
    const { container, root } = await renderMatrix();
    const full = categoryBox(container, "Sales & POS", "Full Sales");
    await act(async () => {
      full.click();
    });
    expect(toggleMany).toHaveBeenCalledWith("g1", salesKeys, false);

    act(() => root.unmount());
    container.remove();
  });

  it("grants every child key when an unchecked category box is clicked", async () => {
    const { container, root } = await renderMatrix();
    const empty = categoryBox(container, "Inventory & Stock", "Empty");
    await act(async () => {
      empty.click();
    });
    expect(toggleMany).toHaveBeenCalledWith("g3", inventoryKeys, true);

    act(() => root.unmount());
    container.remove();
  });

  it("collapses and re-expands a category without touching any grant", async () => {
    const { container, root } = await renderMatrix();
    const rowFor = (label: string) =>
      Array.from(container.querySelectorAll('[role="row"]')).find((row) => row.textContent?.includes(label));

    expect(rowFor("Process Sales")).toBeTruthy();
    const header = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Collapse Sales & POS",
    ) as HTMLButtonElement;
    expect(header.getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      header.click();
    });
    expect(rowFor("Process Sales")).toBeUndefined();
    // The category checkbox itself survives a collapse.
    expect(categoryBox(container, "Sales & POS", "Full Sales")).toBeTruthy();
    expect(toggleMany).not.toHaveBeenCalled();

    const expand = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Expand Sales & POS",
    ) as HTMLButtonElement;
    await act(async () => {
      expand.click();
    });
    expect(rowFor("Process Sales")).toBeTruthy();

    act(() => root.unmount());
    container.remove();
  });
});
