import { describe, it, expect } from "vitest";
import { getPayableDueState } from "@/lib/utils/payables";

const order = {
  status: "received",
  total_amount: 1000,
  amount_paid: 0,
  payment_status: "unpaid",
  due_date: "2026-11-10",
};

describe("getPayableDueState", () => {
  it("flags an unpaid order past its due date as overdue", () => {
    expect(getPayableDueState(order, "2026-11-15")).toBe("overdue");
  });

  it("flags an order due within three days as due soon, and one further out as nothing", () => {
    expect(getPayableDueState({ ...order, due_date: "2026-11-18" }, "2026-11-15")).toBe("due_soon");
    expect(getPayableDueState({ ...order, due_date: "2026-11-19" }, "2026-11-15")).toBeNull();
  });

  it("treats the due day itself as due soon, not overdue", () => {
    expect(getPayableDueState({ ...order, due_date: "2026-11-15" }, "2026-11-15")).toBe("due_soon");
  });

  it("ignores paid, fully-settled, draft and cancelled orders", () => {
    expect(getPayableDueState({ ...order, payment_status: "paid" }, "2026-11-15")).toBeNull();
    expect(getPayableDueState({ ...order, amount_paid: 1000 }, "2026-11-15")).toBeNull();
    expect(getPayableDueState({ ...order, status: "draft" }, "2026-11-15")).toBeNull();
    expect(getPayableDueState({ ...order, status: "cancelled" }, "2026-11-15")).toBeNull();
  });

  it("returns nothing when there is no due date", () => {
    expect(getPayableDueState({ ...order, due_date: null }, "2026-11-15")).toBeNull();
  });
});
