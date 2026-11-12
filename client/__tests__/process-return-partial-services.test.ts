import { describe, it, expect, vi } from "vitest";
import { setupProcessReturnHarness } from "./helpers/process-return-harness";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("useProcessReturnMutation with a service line returned across two returns", () => {
  const { run, seedSale, processReturn, scalar } = setupProcessReturnHarness();

  function returnOneService(sale: unknown, saleItem: unknown) {
    return processReturn({
      sale,
      userId: "user-1",
      reason: "Unhappy",
      totalRefund: 50,
      itemsToReturn: [],
      saleItems: [saleItem],
      servicesToReturn: [
        { id: "ss1", saleServiceId: "ss1", quantity: 2, returnQuantity: 1, unitPrice: 50 },
      ],
    });
  }

  it("stays partially refunded after one of two, then refunds once the remainder is returned", async () => {
    const { sale, saleItem } = seedSale({ saleId: "s1", quantity: 1, unitPrice: 25, returnedQuantity: 1 });
    run(`INSERT INTO sale_services (id, sale_id, service_name, quantity, unit_price, total_price)
         VALUES ('ss1', 's1', 'Consultation', 2, 50, 100)`);

    await returnOneService(sale, saleItem);
    expect(scalar(`SELECT payment_status FROM sales WHERE id = 's1'`)).toBe("partially_refunded");

    await returnOneService(sale, saleItem);
    expect(scalar(`SELECT SUM(quantity) FROM return_services WHERE sale_service_id = 'ss1'`)).toBe(2);
    expect(scalar(`SELECT payment_status FROM sales WHERE id = 's1'`)).toBe("refunded");
  });
});
