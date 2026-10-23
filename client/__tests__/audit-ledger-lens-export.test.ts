import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuditLedgerLens } from "@/lib/hooks/use-audit-ledger-lens";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

const row = (overrides: Partial<AuditItem>): AuditItem => ({
  id: "x",
  name: "Panadol",
  sku: "SKU",
  category: "Analgesics",
  systemQty: 10,
  countedQty: undefined,
  ...overrides,
});

const ids = (rows: AuditItem[]) => rows.map((r) => r.id);

describe("useAuditLedgerLens exportItems", () => {
  it("never contains a row the ledger is not showing", () => {
    const sheet = [
      row({ id: "amoxil", name: "Amoxil", sku: "A-1" }),
      row({ id: "amoxin", name: "Amoxin", sku: "A-2", countedQty: 10 }),
    ];
    const { result, rerender } = renderHook(
      ({ items }) => useAuditLedgerLens(items),
      { initialProps: { items: sheet } },
    );
    act(() => result.current.setCountStatus("uncounted"));
    act(() => result.current.setSearch("amoxil"));
    rerender({
      items: [{ ...sheet[0], countedQty: 10 }, sheet[1]],
    });
    expect(ids(result.current.visibleItems)).toEqual(["amoxil"]);
    expect(result.current.exportItems).toEqual([]);
  });

  it("follows the on-screen sort and status filter", () => {
    const sheet = [
      row({ id: "b", name: "Beta", countedQty: 10 }),
      row({ id: "a", name: "Alpha", countedQty: 10 }),
      row({ id: "c", name: "Gamma" }),
    ];
    const { result } = renderHook(() => useAuditLedgerLens(sheet));
    act(() => result.current.setCountStatus("counted"));
    act(() => result.current.sort.toggleSort("name"));
    expect(ids(result.current.exportItems)).toEqual(["a", "b"]);
  });
});
