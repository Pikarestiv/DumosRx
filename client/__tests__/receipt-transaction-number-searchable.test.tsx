import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReceiptView, type ReceiptTransaction } from "@/components/pos/receipt-view";
import { buildReceiptTransaction } from "@/lib/hooks/use-pos-payment-helpers";
import { saleToReceiptTransaction } from "@/components/pos/sale-to-receipt-transaction";
import { genericFuzzySearch } from "@/lib/utils/search";
import type { SaleWithDetails } from "@/lib/types/sale";

const storeProfile: Record<string, unknown> = {
  name: "Divamax Pharmacy",
  show_barcode_on_receipt: 1,
};

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile, vatPercentage: 0 }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canCustomizeTheme: false, canRemoveBranding: false }),
}));

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));

// Capture the barcode value passed to react-barcode
let lastBarcodeProps: Record<string, unknown> = {};
vi.mock("react-barcode", () => ({
  default: (props: Record<string, unknown>) => {
    lastBarcodeProps = props;
    return <div data-testid="receipt-barcode" data-value={String(props.value)} />;
  },
}));

describe("A-270: Receipt number uses searchable transaction_number and encodes it in barcode", () => {
  it("buildReceiptTransaction populates transactionNumber from checkout params", () => {
    const txn = buildReceiptTransaction({
      saleId: "sale-uuid-1234",
      transactionNumber: "TXN-20261117-ABCD",
      selectedCustomer: null,
      cashierUser: { username: "cashier1" },
      cart: [],
      subtotal: 5000,
      tax: 0,
      discount: 0,
      total: 5000,
      paymentMethod: "cash",
      paymentSplits: [],
      amountPaid: "5000",
    });

    expect(txn.transactionNumber).toBe("TXN-20261117-ABCD");
    expect(txn.transaction_number).toBe("TXN-20261117-ABCD");
    expect(txn.id).toBe("sale-uuid-1234");
  });

  it("saleToReceiptTransaction maps sale.transaction_number to ReceiptTransaction", () => {
    const sale = {
      id: "sale-uuid-5678",
      transaction_number: "TXN-HIST-9999",
      subtotal: 10000,
      total_amount: 10000,
      payment_method: "cash",
      transaction_date: "2026-11-17T10:00:00.000Z",
    } as SaleWithDetails;

    const txn = saleToReceiptTransaction(sale, []);
    expect(txn.transactionNumber).toBe("TXN-HIST-9999");
    expect(txn.transaction_number).toBe("TXN-HIST-9999");
  });

  it("ReceiptView prints transaction_number as Receipt no and encodes it in Barcode", () => {
    const transaction: ReceiptTransaction = {
      id: "38a8bab2-1234-5678-abcd-ef0123456789",
      transactionNumber: "TXN-8DY6G5XH",
      date: "2026-11-17T10:00:00.000Z",
      cashier: "Cashier Alice",
      items: [{ id: "i1", name: "Paracetamol 500mg", quantity: 2, unit_price: 500, subtotal: 1000 }],
      customer: null,
      subtotal: 1000,
      tax: 0,
      discount: 0,
      total: 1000,
      paymentMethod: "cash",
      amountPaid: 1000,
      change: 0,
    };

    render(<ReceiptView transaction={transaction} paperSize="thermal" />);

    // Receipt number prints TXN-8DY6G5XH, NOT RCT-38A8BAB2
    expect(screen.getByText(/TXN-8DY6G5XH/)).toBeTruthy();
    expect(screen.queryByText(/RCT-38A8BAB2/)).toBeNull();

    // Barcode encodes TXN-8DY6G5XH, NOT the 36-char raw UUID
    const barcodeEl = screen.getByTestId("receipt-barcode");
    expect(barcodeEl.getAttribute("data-value")).toBe("TXN-8DY6G5XH");
    expect(lastBarcodeProps.value).toBe("TXN-8DY6G5XH");
  });

  it("ReceiptView formats tax invoices with transaction number prefix INV-", () => {
    const transaction: ReceiptTransaction = {
      id: "38a8bab2-1234-5678-abcd-ef0123456789",
      transactionNumber: "TXN-8DY6G5XH",
      date: "2026-11-17T10:00:00.000Z",
      items: [],
      customer: null,
      subtotal: 1000,
      tax: 75,
      discount: 0,
      total: 1075,
      paymentMethod: "cash",
      amountPaid: 1075,
      change: 0,
    };

    render(<ReceiptView transaction={transaction} documentType="tax" />);
    expect(screen.getByText(/INV-8DY6G5XH/)).toBeTruthy();
  });

  it("ReceiptView gracefully falls back to RCT-<shortId> and UUID barcode if transactionNumber is missing", () => {
    const legacyTransaction: ReceiptTransaction = {
      id: "a1b2c3d4-5678-90ef-ghij-klmnopqrstuv",
      date: "2026-10-01T10:00:00.000Z",
      items: [],
      customer: null,
      subtotal: 500,
      tax: 0,
      discount: 0,
      total: 500,
      paymentMethod: "cash",
      amountPaid: 500,
      change: 0,
    };

    render(<ReceiptView transaction={legacyTransaction} />);
    expect(screen.getByText(/RCT-A1B2C3D4/)).toBeTruthy();
    expect(lastBarcodeProps.value).toBe("a1b2c3d4-5678-90ef-ghij-klmnopqrstuv");
  });

  it("sales history searchable index matches transaction_number, legacy RCT- prefix, and short UUID", () => {
    const sales: SaleWithDetails[] = [
      {
        id: "7f8e9d0a-1111-2222-3333-444455556666",
        transaction_number: "TXN-ALPHA-1234",
        customer_name: "John Doe",
        item_names: "Amoxil||Panadol",
        total_amount: 5000,
      } as SaleWithDetails,
      {
        id: "c5b4a3f2-7777-8888-9999-000011112222",
        transaction_number: "TXN-BETA-5678",
        customer_name: "Jane Smith",
        item_names: "Cough Syrup",
        total_amount: 3000,
      } as SaleWithDetails,
    ];

    const searchable = sales.map((sale) => {
      const shortUuid = sale.id ? sale.id.split("-")[0].toUpperCase() : "";
      return {
        id: sale.id,
        customer_name: sale.customer_name || "Walk-in",
        transaction_number: sale.transaction_number || "",
        receipt_number: shortUuid ? `RCT-${shortUuid}` : "",
        short_id: shortUuid,
        sale_id: sale.id || "",
        item_names: sale.item_names?.replace(/\|\|/g, " ") || "",
      };
    });

    const searchFields: (keyof (typeof searchable)[0])[] = [
      "customer_name",
      "transaction_number",
      "receipt_number",
      "short_id",
      "sale_id",
      "item_names",
    ];

    // 1. Search by exact or partial transaction number
    const res1 = genericFuzzySearch("TXN-ALPHA", searchable, searchFields);
    expect(res1.results.map((r) => r.id)).toEqual(["7f8e9d0a-1111-2222-3333-444455556666"]);

    // 2. Search by legacy printed RCT- prefix
    const res2 = genericFuzzySearch("RCT-C5B4A3F2", searchable, searchFields);
    expect(res2.results.map((r) => r.id)).toEqual(["c5b4a3f2-7777-8888-9999-000011112222"]);

    // 3. Search by 8-char short UUID read out by customer
    const res3 = genericFuzzySearch("C5B4A3F2", searchable, searchFields);
    expect(res3.results.map((r) => r.id)).toEqual(["c5b4a3f2-7777-8888-9999-000011112222"]);

    // 4. Scanned legacy full UUID barcode
    const res4 = genericFuzzySearch("7f8e9d0a-1111-2222-3333-444455556666", searchable, searchFields);
    expect(res4.results.map((r) => r.id)).toEqual(["7f8e9d0a-1111-2222-3333-444455556666"]);
  });
});
