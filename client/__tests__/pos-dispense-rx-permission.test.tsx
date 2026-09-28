import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);
const getPrescriptionItems = vi.fn();

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("@/lib/db/queries/prescriptions", () => ({
  getPrescriptionItems: (...args: unknown[]) => getPrescriptionItems(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { usePOSPrescription } from "@/lib/hooks/use-pos-prescription";

const product = {
  id: "p1",
  name: "Amoxil",
  strength: "500mg",
  unit_price: 500,
} as never;

function run(granted: boolean) {
  hasPermission.mockImplementation((key) =>
    granted ? true : key !== "dispense_prescriptions",
  );
  const restoreCart = vi.fn();
  const router = { replace: vi.fn(), push: vi.fn() } as never;
  const rendered = renderHook(() =>
    usePOSPrescription({
      searchParams: new URLSearchParams("dispense_rx=rx-1"),
      products: [product],
      cartLength: 0,
      restoreCart,
      router,
      pathname: "/pos",
    }),
  );
  return { restoreCart, rendered };
}

/**
 * "/pos?dispense_rx=<id>" is the real dispense action - it is what pulls
 * the prescription's items onto the till - and it is typeable, so hiding
 * the Dispense button alone would not gate it.
 */
describe("POS dispense_rx permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    getPrescriptionItems.mockReset();
    getPrescriptionItems.mockResolvedValue([
      {
        id: "i1",
        product_name: "Amoxil",
        strength: "500mg",
        quantity: 2,
      },
    ]);
  });

  it("loads the prescription onto the till with dispense_prescriptions", async () => {
    const { restoreCart } = run(true);
    await waitFor(() => expect(restoreCart).toHaveBeenCalled());
  });

  it("does not load the prescription without dispense_prescriptions", async () => {
    const { restoreCart } = run(false);
    await waitFor(() =>
      expect(getPrescriptionItems).not.toHaveBeenCalled(),
    );
    expect(restoreCart).not.toHaveBeenCalled();
  });

  it("checks the dispense_prescriptions key specifically", () => {
    run(true);
    expect(hasPermission).toHaveBeenCalledWith("dispense_prescriptions");
  });
});
