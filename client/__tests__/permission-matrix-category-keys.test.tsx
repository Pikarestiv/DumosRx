import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/hooks/use-permission-groups", () => ({
  usePermissionGroups: () => ({
    groups: [
      { id: "g1", name: "Manager", based_on_role: "manager", is_default: true, permissions: ["process_sales"] },
    ],
    toggle: vi.fn(),
    toggleMany: vi.fn(),
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

// Lives in its own file on purpose: React only logs a missing-key warning
// once per offending component, so a second render of PermissionMatrix
// anywhere in the same file would make this assertion vacuous.
describe("PermissionMatrix category rows", () => {
  it("renders the category groupings without a React key warning", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { PermissionMatrix } = await import("@/components/settings/roles-permissions/permission-matrix");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PermissionMatrix));
    });

    const keyWarnings = consoleError.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === "string" && arg.includes('unique "key" prop')),
    );
    consoleError.mockRestore();
    expect(keyWarnings).toHaveLength(0);

    act(() => root.unmount());
    container.remove();
  });
});
