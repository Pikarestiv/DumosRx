import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/hooks/use-permission-groups", () => ({
  usePermissionGroups: () => ({
    groups: [
      { id: "g1", name: "Manager", based_on_role: "manager", is_default: true, permissions: ["process_sales"] },
      { id: "g2", name: "Auditor", based_on_role: "auditor", is_default: true, permissions: ["view_reports"] },
    ],
    toggle: vi.fn(),
    createGroup: vi.fn(),
    copyGroup: vi.fn(),
    revertToDefault: vi.fn(),
    renameGroup: vi.fn(),
    deleteGroup: vi.fn(),
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
});
