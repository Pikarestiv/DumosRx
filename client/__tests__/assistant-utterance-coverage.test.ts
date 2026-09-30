import { describe, it, expect } from "vitest";
import { matchIntent } from "@/lib/assistant/intent-matcher";
import { normalizeUtterance } from "@/lib/assistant/normalize";
import { INTENTS } from "@/lib/assistant/intents";

function resolveIntentId(utterance: string): string {
  const { normalized } = normalizeUtterance(utterance);
  const result = matchIntent(normalized, INTENTS);
  if (result.kind === "match") return result.intent.id;
  if (result.kind === "ambiguous") {
    return `ambiguous:${result.candidates.map((c) => c.id).sort().join("|")}`;
  }
  return "none";
}

const UTTERANCES: [string, string][] = [
  ["how much profit did we make", "profit_summary"],
  ["how much gross profit did we make on 2026-09-01", "profit_summary"],
  ["net profit this month", "profit_summary"],
  ["what was our profit margin last month", "profit_summary"],
  ["show me the profit and loss", "profit_summary"],

  ["what did i sell today", "my_sales_today"],
  ["my sales today", "my_sales_today"],
  ["how much have i sold today", "my_sales_today"],

  ["total sales yesterday", "sales_summary"],
  ["how many sales today", "sales_summary"],
  ["sales for 01/09/2026", "sales_summary"],
  ["sales on 2026-09-01", "sales_summary"],
  ["total sales from 2026-09-01 to 2026-09-15", "sales_summary"],

  ["which products are running out", "inventory_status"],
  ["what is low on stock", "inventory_status"],
  ["show expired items", "inventory_status"],
  ["anything expiring soon", "inventory_status"],
  ["inventory status", "inventory_status"],

  ["do we have panadol", "product_stock"],
  ["how much paracetamol is left", "product_stock"],
  ["how many paracetamol do we have", "product_stock"],
  ["is amoxicillin in stock", "product_stock"],
  ["stock of ibuprofen", "product_stock"],

  ["create a new product", "navigate_add_product"],
  ["add new item to catalog", "navigate_add_product"],
  ["how do i add a product", "navigate_add_product"],

  ["how to sell something", "navigate_make_sale"],
  ["start a new sale", "navigate_make_sale"],
  ["ring up a customer", "navigate_make_sale"],
  ["how do i make a sale", "navigate_make_sale"],

  ["fix a stock count", "navigate_adjust_stock"],
  ["how do i adjust stock", "navigate_adjust_stock"],

  ["export my data", "navigate_backup_data"],
  ["how do i back up my data", "navigate_backup_data"],

  ["order from supplier", "navigate_create_purchase_order"],
  ["create a purchase order", "navigate_create_purchase_order"],

  ["where are the reports", "navigate_view_reports"],
  ["how do i view reports", "navigate_view_reports"],

  ["how do i start a stock audit", "navigate_start_audit"],
  ["how do i record an expense", "navigate_record_expense"],
  ["add a new customer", "navigate_add_customer"],
  ["where do i add staff", "navigate_add_staff"],
  ["how do i run daily close", "navigate_daily_close"],
  ["change the receipt footer", "navigate_receipt_settings"],
  ["how do i switch account", "navigate_switch_account"],

  ["what are my sales today", "my_sales_today"],
  ["how many sales did we do today", "sales_summary"],
  ["show me today's sales", "sales_summary"],
  ["how many transactions yesterday", "sales_summary"],
  ["how much money did we make today", "sales_summary"],
  ["gross profit last month", "profit_summary"],
  ["what is our margin", "profit_summary"],
  ["revenue today", "profit_summary"],
  ["what products are out of stock", "inventory_status"],
  ["which items expire soon", "inventory_status"],
  ["restore my data", "navigate_backup_data"],
  ["reorder from a supplier", "navigate_create_purchase_order"],
  ["open the reports page", "navigate_view_reports"],
  ["i want to sell a product", "navigate_make_sale"],
  ["where is the pos", "navigate_make_sale"],
  ["count stock", "navigate_start_audit"],
  ["stocktake", "navigate_start_audit"],
  ["new cashier", "navigate_add_staff"],
  ["log expense", "navigate_record_expense"],
  ["add customer", "navigate_add_customer"],
];

describe("assistant utterance coverage (the plan's post-data-tools sweep, pinned)", () => {
  it.each(UTTERANCES)("routes %j to %s", (utterance, expectedId) => {
    expect(resolveIntentId(utterance)).toBe(expectedId);
  });

  it("does not route a refund question to a sales or profit data tool", () => {
    const resolved = resolveIntentId("how do i refund a sale");
    expect(["sales_summary", "my_sales_today", "profit_summary"]).not.toContain(resolved);
  });

  it.each([["what is the weather today"], ["hello"], ["thanks"]])(
    "still returns none for %j",
    (utterance) => {
      expect(resolveIntentId(utterance)).toBe("none");
    },
  );
});
