import { describe, it, expect, vi } from "vitest";
import { setupProcessReturnHarness } from "./helpers/process-return-harness";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("Prescription State Machine: Dispense, Refills & Returns", () => {
  const { run, seedSale, processReturn, scalar } = setupProcessReturnHarness();

  it("full return of an initial prescription dispense reverts status to ready and clears dispensed_at", async () => {
    run(
      `INSERT INTO prescriptions (id, prescription_number, status, dispensed_at, _deleted)
       VALUES ('rx-init-1', 'RX-001', 'completed', '2026-11-01T10:00:00.000Z', 0)`,
    );
    run(
      `INSERT INTO prescription_items (id, prescription_id, product_name, refills_authorized, refills_used, _deleted)
       VALUES ('rxi-1', 'rx-init-1', 'Amoxicillin 500mg', 3, 0, 0)`,
    );

    const { sale, saleItem } = seedSale({
      saleId: "s-rx-init-1",
      quantity: 2,
      unitPrice: 50,
      prescriptionId: "rx-init-1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Patient cancelled dispense",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT status FROM prescriptions WHERE id = 'rx-init-1'`)).toBe("ready");
    expect(scalar(`SELECT dispensed_at FROM prescriptions WHERE id = 'rx-init-1'`)).toBeNull();
    expect(scalar(`SELECT refills_used FROM prescription_items WHERE id = 'rxi-1'`)).toBe(0);
  });

  it("partial return of an initial dispense preserves completed status", async () => {
    run(
      `INSERT INTO prescriptions (id, prescription_number, status, dispensed_at, _deleted)
       VALUES ('rx-part-1', 'RX-002', 'completed', '2026-11-01T10:00:00.000Z', 0)`,
    );
    run(
      `INSERT INTO prescription_items (id, prescription_id, product_name, refills_authorized, refills_used, _deleted)
       VALUES ('rxi-2', 'rx-part-1', 'Amoxicillin 500mg', 3, 0, 0)`,
    );

    const { sale, saleItem } = seedSale({
      saleId: "s-rx-part-1",
      quantity: 4,
      unitPrice: 25,
      prescriptionId: "rx-part-1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Returned 1 of 4 units",
      totalRefund: 25,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT status FROM prescriptions WHERE id = 'rx-part-1'`)).toBe("completed");
    expect(scalar(`SELECT dispensed_at FROM prescriptions WHERE id = 'rx-part-1'`)).not.toBeNull();
  });

  it("full return of a refill dispense decrements refills_used and keeps status completed", async () => {
    run(
      `INSERT INTO prescriptions (id, prescription_number, status, dispensed_at, _deleted)
       VALUES ('rx-refill-1', 'RX-003', 'completed', '2026-11-01T10:00:00.000Z', 0)`,
    );
    run(
      `INSERT INTO prescription_items (id, prescription_id, product_name, refills_authorized, refills_used, _deleted)
       VALUES ('rxi-3', 'rx-refill-1', 'Metformin 500mg', 3, 2, 0)`,
    );

    const { sale, saleItem } = seedSale({
      saleId: "s-rx-refill-1",
      quantity: 2,
      unitPrice: 50,
      prescriptionId: "rx-refill-1",
      paymentDetails: JSON.stringify({ is_refill: true }),
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Refill bottle damaged",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2 }],
      saleItems: [saleItem],
    });

    // Refills used must decrement from 2 to 1 so the patient's refill allotment is restored
    expect(scalar(`SELECT refills_used FROM prescription_items WHERE id = 'rxi-3'`)).toBe(1);
    // Prescription stays completed since the primary/prior dispense remains valid
    expect(scalar(`SELECT status FROM prescriptions WHERE id = 'rx-refill-1'`)).toBe("completed");
  });

  it("refill return gracefully clamps refills_used at zero without underflowing", async () => {
    run(
      `INSERT INTO prescriptions (id, prescription_number, status, dispensed_at, _deleted)
       VALUES ('rx-refill-2', 'RX-004', 'completed', '2026-11-01T10:00:00.000Z', 0)`,
    );
    run(
      `INSERT INTO prescription_items (id, prescription_id, product_name, refills_authorized, refills_used, _deleted)
       VALUES ('rxi-4', 'rx-refill-2', 'Metformin 500mg', 3, 0, 0)`,
    );

    const { sale, saleItem } = seedSale({
      saleId: "s-rx-refill-2",
      quantity: 1,
      unitPrice: 50,
      prescriptionId: "rx-refill-2",
      paymentDetails: JSON.stringify({ is_refill: true }),
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Returned",
      totalRefund: 50,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT refills_used FROM prescription_items WHERE id = 'rxi-4'`)).toBe(0);
  });
});
