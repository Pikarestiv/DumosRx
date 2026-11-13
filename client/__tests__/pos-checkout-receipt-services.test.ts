import { describe, it, expect } from "vitest";
import type { CartItem } from "@/lib/hooks/use-pos-cart";
import { buildReceiptTransaction } from "@/lib/hooks/use-pos-payment-helpers";

const productLine = {
  id: "prod-1",
  name: "Moisturizing Cream",
  generic_name: "",
  strength: "",
  unit_price: 3000,
  original_unit_price: 3000,
  cost_price: 1000,
  stock: 10,
  quantity: 2,
  subtotal: 6000,
  item_type: "product",
} as CartItem;

const serviceLine = {
  ...productLine,
  id: "srv-1",
  name: "Pedicure Deluxe",
  unit_price: 5000,
  original_unit_price: 5000,
  cost_price: 0,
  stock: null,
  quantity: 1,
  subtotal: 5000,
  item_type: "service",
} as CartItem;

function receiptFor(cart: CartItem[], overrides: Partial<Parameters<typeof buildReceiptTransaction>[0]> = {}) {
  return buildReceiptTransaction({
    saleId: "sale-1",
    selectedCustomer: null,
    cashierUser: { first_name: "Ada", last_name: "Obi" },
    cart,
    subtotal: 11000,
    tax: 0,
    discount: 0,
    total: 11000,
    paymentMethod: "cash",
    paymentSplits: [],
    amountPaid: "12000",
    ...overrides,
  });
}

describe("buildReceiptTransaction (post-checkout receipt)", () => {
  it("marks service lines '(Service)' and leaves product lines as they are", () => {
    const receipt = receiptFor([productLine, serviceLine]);

    expect(receipt.items.map((i) => i.name)).toEqual([
      "Moisturizing Cream",
      "Pedicure Deluxe (Service)",
    ]);
    expect(receipt.items.map((i) => i.subtotal)).toEqual([6000, 5000]);
  });

  it("keeps the real sale id, cashier and cash change rather than proforma placeholders", () => {
    const receipt = receiptFor([serviceLine]);

    expect(receipt.id).toBe("sale-1");
    expect(receipt.cashier).toBe("Ada Obi");
    expect(receipt.paymentMethod).toBe("cash");
    expect(receipt.amountPaid).toBe(12000);
    expect(receipt.change).toBe(1000);
  });

  it("produces an empty item list for an empty cart", () => {
    expect(receiptFor([], { subtotal: 0, total: 0, amountPaid: "0" }).items).toEqual([]);
  });
});
