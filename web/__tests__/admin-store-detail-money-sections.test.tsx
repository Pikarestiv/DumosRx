import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreBusinessMetricsCard } from "@/components/admin/stores/details/store-metrics-cards";
import { StoreRecentTransactionsCard } from "@/components/admin/stores/details/store-detail-sections";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";

const baseStore = {
  id: "store-1",
  name: "Gated Store",
  operational_metrics: {
    staff_count: 2,
    device_id: "DEV-1",
    device_count: 1,
    active_sessions: 0,
    inventory: { products: 10, categories: 2, suppliers: 1, customers: 3 },
    stock_activity: { movements: 4, movements_last_window: 1, audits: 0, audits_last_window: 0 },
    last_active_at: null,
    last_active_human: "Never",
    activity_last_window: 0,
  },
} as unknown as AdminStoreDetail;

const withMoney = {
  ...baseStore,
  business_metrics: {
    revenue_raw: 1000,
    revenue: "₦1,000",
    order_count: 4,
    average_order_value: "₦250",
    average_order_value_raw: 250,
    active_days: 3,
    days_since_registration: 10,
    first_sale_at: "Jan 01, 2026",
    last_sale_at: "Jan 04, 2026",
    window_days: 30,
    revenue_last_window: "₦1,000",
    orders_last_window: 4,
    revenue_growth_pct: null,
    order_growth_pct: null,
    monthly_trend: [{ label: "Jan", revenue: "₦1,000", revenue_raw: 1000, orders: 4 }],
  },
  recent_transactions: [
    {
      id: "txn-1",
      date: "01/01/2026",
      desc: "Pro plan",
      amount: "₦10,000",
      status: "success",
      reference: "ref-1",
      receipt_url: null,
    },
  ],
} as unknown as AdminStoreDetail;

describe("Store Details money-bearing sections", () => {
  it("renders nothing when the API omitted business_metrics for a delegated admin", () => {
    const { container } = render(<StoreBusinessMetricsCard store={baseStore} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the API omitted recent_transactions for a delegated admin", () => {
    const { container } = render(<StoreRecentTransactionsCard store={baseStore} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("still renders both sections for a super_admin payload that carries them", () => {
    render(<StoreBusinessMetricsCard store={withMoney} />);
    expect(screen.getByText("Business Metrics")).toBeInTheDocument();

    render(<StoreRecentTransactionsCard store={withMoney} />);
    expect(screen.getByText("Recent Transactions")).toBeInTheDocument();
    expect(screen.getByText("₦10,000")).toBeInTheDocument();
  });
});
