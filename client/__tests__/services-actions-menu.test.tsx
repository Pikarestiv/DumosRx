import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ canExport: true, downloads: [] as { blob: Blob; filename: string }[] }));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => key === "export_product_list" && state.canExport,
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { name: "Dumos Clinic" } }),
}));
vi.mock("@/lib/utils/download-blob", () => ({
  downloadBlob: (blob: Blob, filename: string) => state.downloads.push({ blob, filename }),
}));

import { ServicesActionsMenu } from "@/components/services/services-actions-menu";
import type { Service } from "@/lib/types/service";

const services = [
  { id: "s1", name: "BP check", code: "BP1", category: "Consultation", description: "Quick", price: 500, is_active: 1 } as Service,
  { id: "s2", name: "Old service", code: null, category: null, description: null, price: 100, is_active: 0 } as Service,
];

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /services actions/i }), { button: 0, ctrlKey: false, pointerType: "mouse" });
}

function renderMenu(overrides: Partial<React.ComponentProps<typeof ServicesActionsMenu>> = {}) {
  const onManageCategories = vi.fn();
  render(<ServicesActionsMenu services={services} isFiltered={false} canManageCategories onManageCategories={onManageCategories} {...overrides} />);
  return onManageCategories;
}

beforeEach(() => {
  state.canExport = true;
  state.downloads = [];
});

describe("Services actions menu", () => {
  it("opens the category settings from Manage categories", () => {
    const onManageCategories = renderMenu();
    openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /manage categories/i }));

    expect(onManageCategories).toHaveBeenCalledTimes(1);
  });

  it("exports the services shown as a CSV named for the store", async () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /export services list/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /export as csv/i }));

    await waitFor(() => expect(state.downloads).toHaveLength(1));
    const csv = await state.downloads[0].blob.text();
    expect(state.downloads[0].filename).toMatch(/Dumos-Clinic_Services_.*\.csv$/);
    expect(csv).toContain("Service Name,Code,Category,Description,Price,Status");
    expect(csv).toContain("BP check,BP1,Consultation,Quick,500,Active");
    expect(csv).toContain("Old service");
    expect(csv).toContain("Inactive");
  });

  it("hides the export without export_product_list but keeps Manage categories", () => {
    state.canExport = false;
    renderMenu();
    openMenu();

    expect(screen.queryByRole("menuitem", { name: /export services list/i })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /manage categories/i })).toBeTruthy();
  });

  it("renders nothing for someone who can neither export nor manage categories", () => {
    state.canExport = false;
    renderMenu({ canManageCategories: false });

    expect(screen.queryByRole("button", { name: /services actions/i })).toBeNull();
  });
});
