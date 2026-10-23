import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        start: index * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
    measureElement: () => {},
  }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { name: "Test Pharmacy", uppercase_display_enabled: 0 } }),
}));
vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: () => true }));
vi.mock("@/lib/db/sync-engine", () => ({ sync: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/queries/products", () => ({
  getProductsWithDetails: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/queries/inventory", () => ({
  getProductStockQuantity: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/hooks/use-stock-audit-mutation", () => ({
  useSubmitStockAuditMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/use-count-freshness", () => ({
  useCountFreshness: () => ({ shouldWarn: false }),
}));

const downloadBlob = vi.fn();
vi.mock("@/lib/utils/download-blob", () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}));
const printNode = vi.fn();
vi.mock("@/lib/utils/print-node", () => ({
  printNode: (node: HTMLElement) => printNode(node.textContent),
}));
const generateReportPdfBlob = vi.fn();
vi.mock("@/lib/utils/report-pdf", () => ({
  generateReportPdfBlob: (...args: unknown[]) => generateReportPdfBlob(...args),
  PdfGenerationCancelledError: class extends Error {},
}));
const buildBlobFromRows = vi.fn();
vi.mock("@/lib/utils/product-import-export", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  buildBlobFromRows: (...args: unknown[]) => buildBlobFromRows(...args),
}));

import { StockAudits } from "@/components/stock-batch/stock-audits";
import { useStockAuditDraftStore } from "@/lib/hooks/use-stock-audit-draft";

function item(overrides: Partial<AuditItem>): AuditItem {
  return { id: "x", name: "x", sku: "x", category: "x", systemQty: 10, ...overrides };
}

const draft: AuditItem[] = [
  item({ id: "f", name: "Flagyl", sku: "F-1", category: "Antibiotics", systemQty: 4 }),
  item({ id: "p", name: "Panadol", sku: "P-1", category: "Analgesics", systemQty: 20 }),
  item({ id: "a", name: "Amoxil", sku: "A-1", category: "Antibiotics", systemQty: 9, countedQty: 7, counted: true }),
];

function renderAudit() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StockAudits onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, new MouseEvent("pointerdown", { bubbles: true }));
}

function chooseFilter(pill: RegExp, option: RegExp) {
  openMenu(screen.getByRole("button", { name: pill }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: option }));
}

function exportVia(label: RegExp) {
  openMenu(screen.getByRole("button", { name: /more export options/i }));
  fireEvent.click(screen.getByRole("menuitem", { name: label }));
}

const productsIn = (rows: Record<string, unknown>[]) => rows.map((r) => r.Product);

describe("Cycle Count export follows the ledger's filters and sort", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    generateReportPdfBlob.mockResolvedValue(new Blob(["pdf"]));
    buildBlobFromRows.mockResolvedValue(new Blob(["csv"]));
    useStockAuditDraftStore.setState({ items: draft });
    renderAudit();
    fireEvent.click(await screen.findByRole("button", { name: /^Item/ }));
    chooseFilter(/^Category:/, /Antibiotics/);
  });

  it("exports only the category's rows, in the on-screen sort order, with their counts", async () => {
    exportVia(/Export CSV/);
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    const [headers, rows, format] = buildBlobFromRows.mock.calls[0];
    expect(format).toBe("csv");
    expect(headers).toContain("Counted Qty");
    expect(productsIn(rows)).toEqual(["Amoxil", "Flagyl"]);
    expect(rows.map((r: Record<string, unknown>) => r["Counted Qty"])).toEqual([7, ""]);
    expect(downloadBlob.mock.calls[0][1]).toMatch(/^StockAudit_\d{4}-\d{2}-\d{2}_Antibiotics\.csv$/);
  });

  it("puts only the category's rows in the PDF and names the category in its subtitle", async () => {
    exportVia(/Download PDF/);
    await waitFor(() => expect(generateReportPdfBlob).toHaveBeenCalled());
    const [doc] = generateReportPdfBlob.mock.calls[0];
    expect(doc.subtitle).toBe("2 of 3 product(s) · Category: Antibiotics");
    expect(productsIn(doc.rows)).toEqual(["Amoxil", "Flagyl"]);
  });

  it("prints only the category's rows under a header naming the filter", async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Print$/ }));
    await waitFor(() => expect(printNode).toHaveBeenCalled());
    const printed = printNode.mock.calls[0][0] as string;
    expect(printed).toContain("2 of 3 product(s) · Category: Antibiotics");
    expect(printed.indexOf("Amoxil")).toBeLessThan(printed.indexOf("Flagyl"));
    expect(printed).not.toContain("Panadol");
  });

  it("disables Print and every export when the filters match nothing, leaving Start over", () => {
    chooseFilter(/^Count:/, /Qty Differences/);
    chooseFilter(/^Category:/, /Analgesics/);
    expect(screen.getByRole("button", { name: /^Print$/ })).toHaveProperty("disabled", true);
    openMenu(screen.getByRole("button", { name: /more export options/i }));
    for (const label of [/Download PDF/, /Export CSV/, /Export Excel/]) {
      expect(screen.getByRole("menuitem", { name: label }).getAttribute("aria-disabled")).toBe("true");
    }
    expect(screen.getByRole("menuitem", { name: /Start over/ }).getAttribute("aria-disabled")).toBeNull();
  });
});
