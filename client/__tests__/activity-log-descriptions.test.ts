import { describe, it, expect } from "vitest";
import {
  describeActivity,
  formatTableLabel,
  summarizeActivityDetails,
} from "@/components/activity-log/describe-activity";

describe("Activity Log descriptions and table labels", () => {
  it("formats table names into readable labels", () => {
    expect(formatTableLabel("stock_batches")).toBe("Stock Batch");
    expect(formatTableLabel("purchase_orders")).toBe("Purchase Order");
    expect(formatTableLabel(null)).toBe("General");
  });

  it("describes stock movements with quantity, type, and product or reason", () => {
    expect(
      describeActivity({
        action: "INSERT",
        table_name: "stock_movements",
        details: JSON.stringify({
          movement_type: "adjustment",
          quantity: -1,
          product_name: "Himalayan Goji Berry Cream",
          reason: "Quick edit from catalog",
        }),
      }),
    ).toBe("Stock adjustment (-1): Himalayan Goji Berry Cream");

    expect(
      describeActivity({
        action: "INSERT",
        table_name: "stock_movements",
        details: JSON.stringify({
          movement_type: "adjustment",
          quantity: 5,
          reason: "Manual recount",
        }),
      }),
    ).toBe("Stock adjustment (+5) · Manual recount");
  });

  it("includes username on auth actions when recorded", () => {
    expect(
      describeActivity({
        action: "LOGIN",
        table_name: "users",
        details: JSON.stringify({ username: "chiamaka" }),
      }),
    ).toBe("Signed in (chiamaka)");

    expect(
      describeActivity({
        action: "LOGIN_FAILED",
        table_name: "users",
        details: JSON.stringify({ username: "chisom" }),
      }),
    ).toBe("Failed sign-in attempt (chisom)");
  });

  it("describes suppliers, categories, staff, and server description fallbacks", () => {
    expect(
      describeActivity({
        action: "DELETE",
        table_name: "suppliers",
        details: JSON.stringify({ name: "Emzor Pharma" }),
      }),
    ).toBe('Removed supplier "Emzor Pharma"');

    expect(
      describeActivity({
        action: "UPDATE",
        table_name: "users",
        details: JSON.stringify({ first_name: "Ada", last_name: "Obi" }),
      }),
    ).toBe('Updated staff "Ada Obi"');

    expect(
      describeActivity({
        action: "TILL_RELINK_CODE_ISSUED",
        table_name: null,
        details: JSON.stringify({ description: "Issued till re-link code for Front Till" }),
      }),
    ).toBe("Issued till re-link code");
  });

  it("summarizes reason and batch number for row subtitles", () => {
    expect(
      summarizeActivityDetails({
        action: "INSERT",
        table_name: "stock_movements",
        details: JSON.stringify({
          reason: "Quick edit from catalog",
          batch_number: "B-101",
        }),
      }),
    ).toBe("Quick edit from catalog · Batch #B-101");
  });
});
