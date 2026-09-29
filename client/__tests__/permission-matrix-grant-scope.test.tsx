import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  buildGrantScope,
  canGrantPermission,
  getUngrantablePermissions,
  isGroupEditable,
  isUnrestrictedGrantRole,
} from "@/lib/permissions/grant-scope";

const toggle = vi.fn();
const toggleMany = vi.fn();

// The acting user holds manage_roles_permissions (so the matrix renders at
// all) and process_sales, but NOT manage_staff.
const scope = { unrestricted: false, ownPermissions: ["manage_roles_permissions", "process_sales"] };

vi.mock("@/lib/hooks/use-permission-groups", () => ({
  usePermissionGroups: () => ({
    groups: [
      { id: "g1", name: "Cashier", based_on_role: "sales_staff", is_default: true, permissions: ["process_sales"] },
      { id: "g2", name: "Auditor", based_on_role: "auditor", is_default: true, permissions: ["view_reports"] },
    ],
    toggle,
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
  useOwnPermissionGroupId: () => null,
  useOwnGrantScope: () => scope,
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canCreateCustomPermissionGroups: true,
    withRestriction: (fn: (...args: unknown[]) => void) => fn,
  }),
}));

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

function cellFor(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("input")).find((i) => i.getAttribute("aria-label") === label) as
    | HTMLInputElement
    | undefined;
}

describe("grant scope (mirrors the server's sanitizePermissionGroupSyncPayload)", () => {
  it("treats exactly store_owner, admin and super_admin as unrestricted", () => {
    expect(isUnrestrictedGrantRole("store_owner")).toBe(true);
    expect(isUnrestrictedGrantRole("admin")).toBe(true);
    expect(isUnrestrictedGrantRole("SUPER_ADMIN")).toBe(true);
    expect(isUnrestrictedGrantRole("super admin")).toBe(false);
    expect(isUnrestrictedGrantRole("manager")).toBe(false);
    expect(isUnrestrictedGrantRole(null)).toBe(false);
  });

  it("gives a caller with no permission group nothing to grant, like the server", () => {
    const none = buildGrantScope("manager", null);
    expect(canGrantPermission(none, "process_sales")).toBe(false);
    expect(canGrantPermission(buildGrantScope("store_owner", null), "process_sales")).toBe(true);
  });

  it("locks a whole group when it already holds a key the caller cannot grant", () => {
    const manager = buildGrantScope("manager", ["process_sales"]);
    expect(getUngrantablePermissions(manager, ["process_sales", "view_reports"])).toEqual(["view_reports"]);
    expect(isGroupEditable(manager, ["process_sales", "view_reports"])).toBe(false);
    expect(isGroupEditable(manager, ["process_sales"])).toBe(true);
    expect(isGroupEditable(buildGrantScope("store_owner", []), ["view_reports"])).toBe(true);
  });
});

describe("PermissionMatrix for a caller whose own grants are restricted", () => {
  beforeEach(() => {
    toggle.mockClear();
    toggleMany.mockClear();
  });

  it("disables, but still shows, a checkbox for a key the caller does not hold", async () => {
    const { container, root } = await renderMatrix();

    const cell = cellFor(container, "Manage Staff - Cashier");
    expect(cell).toBeTruthy();
    expect(cell!.disabled).toBe(true);
    expect(cell!.getAttribute("title")).toBe(
      "You can't grant a permission you don't hold yourself - ask the store owner to change this.",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("leaves a key the caller does hold editable on an otherwise editable group", async () => {
    const { container, root } = await renderMatrix();

    const cell = cellFor(container, "Process Sales - Cashier");
    expect(cell!.disabled).toBe(false);
    expect(cell!.getAttribute("title")).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("locks every cell of a group that already holds a key the caller does not hold", async () => {
    const { container, root } = await renderMatrix();

    const cell = cellFor(container, "Process Sales - Auditor");
    expect(cell!.disabled).toBe(true);
    expect(cell!.getAttribute("title")).toBe(
      "This group already has permissions you don't hold yourself, so you can't change it - ask the store owner to make this change.",
    );
    expect(cellFor(container, "Staff & Groups - all permissions - Auditor")!.disabled).toBe(true);

    act(() => root.unmount());
    container.remove();
  });

  it("leaves a key the caller cannot grant out of a category-level bulk write", async () => {
    const { container, root } = await renderMatrix();

    const box = cellFor(container, "Staff & Groups - all permissions - Cashier");
    expect(box!.disabled).toBe(false);
    await act(async () => {
      box!.click();
    });
    const [, keys] = toggleMany.mock.calls[0];
    expect(keys).toContain("manage_roles_permissions");
    expect(keys).not.toContain("manage_staff");

    act(() => root.unmount());
    container.remove();
  });
});
