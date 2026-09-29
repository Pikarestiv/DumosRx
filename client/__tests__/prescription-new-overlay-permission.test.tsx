import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);
let searchParams = new URLSearchParams();

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/hooks/use-prescription-queue", () => ({
  usePrescriptionQueue: () => ({
    searchTerm: "",
    setSearchTerm: vi.fn(),
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    filteredPrescriptions: [],
    selectedPrescription: null,
    setSelectedPrescription: vi.fn(),
    updatePrescriptionStatus: vi.fn(),
    updatingStatusId: null,
    isFuzzyFallback: false,
  }),
}));

vi.mock("@/lib/db/queries/sales", () => ({
  getSaleForPrescription: vi.fn(),
}));

import { usePrescriptionManagement } from "@/lib/hooks/use-prescription-management";

/**
 * "?action=add" and "?edit_rx=<id>" are typeable, so hiding the "New
 * Prescription" header action alone is not a gate - the overlay itself has
 * to require manage_prescriptions.
 */
describe("new/edit prescription overlay permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    searchParams = new URLSearchParams();
  });

  it("opens the overlay for ?action=add with manage_prescriptions", () => {
    searchParams = new URLSearchParams("action=add");
    const { result } = renderHook(() => usePrescriptionManagement());
    expect(result.current.showNewPrescription).toBe(true);
  });

  it("withholds the overlay for ?action=add without manage_prescriptions", () => {
    hasPermission.mockImplementation((key) => key !== "manage_prescriptions");
    searchParams = new URLSearchParams("action=add");
    const { result } = renderHook(() => usePrescriptionManagement());
    expect(result.current.showNewPrescription).toBe(false);
  });

  it("withholds the overlay for a typed ?edit_rx without manage_prescriptions", () => {
    hasPermission.mockImplementation((key) => key !== "manage_prescriptions");
    searchParams = new URLSearchParams("edit_rx=rx-1");
    const { result } = renderHook(() => usePrescriptionManagement());
    expect(result.current.showNewPrescription).toBe(false);
  });

  it("checks the manage_prescriptions key specifically", () => {
    renderHook(() => usePrescriptionManagement());
    expect(hasPermission).toHaveBeenCalledWith("manage_prescriptions");
  });
});
