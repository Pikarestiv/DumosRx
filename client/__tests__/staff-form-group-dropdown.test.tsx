import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

vi.mock("@/lib/hooks/use-permission-groups", () => ({
  usePermissionGroups: () => ({
    groups: [
      { id: "g1", name: "Manager", based_on_role: "manager", is_default: true, permissions: [] },
      { id: "g2", name: "Supervisor", based_on_role: "manager", is_default: false, permissions: [] },
    ],
  }),
}));

describe("Staff form Group dropdown", () => {
  it("lists every store group, default and custom, instead of the fixed STAFF_ROLES list", async () => {
    const { StaffFormFields } = await import("@/components/settings/staff/staff-form-fields");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        // Deliberately partial: this test only exercises the Group Select's
        // rendering, not the whole form's required-field wiring.
        React.createElement(StaffFormFields, {
          formId: "test-form",
          onSubmit: () => {},
          formData: { role: "g1", permission_group_id: "g1" },
          setFormData: () => {},
          isEditing: false,
          availableStores: [],
        } as unknown as React.ComponentProps<typeof StaffFormFields>),
      );
    });

    expect(container.textContent).toContain("Manager");
    expect(container.textContent).toContain("Supervisor");

    act(() => root.unmount());
    container.remove();
  });
});
