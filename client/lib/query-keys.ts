// Query-key factory + table-dependency tagging convention.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#query-keys-L1

import { getActiveStoreId, getCurrentUserId } from "./db/core";
import { getLocalTodayDate } from "./utils";

function resource<K extends readonly unknown[]>(queryKey: K, tables: string[]) {
  return {
    queryKey: [...queryKey, getActiveStoreId(), getCurrentUserId()] as const,
    meta: { tables },
  };
}

export const queryKeys = {
  products: {
    all: () => resource(["products"] as const, ["products"]),
    list: () => resource(["products", "list"] as const, ["products"]),
    withDetails: () =>
      resource(["productsWithDetails"] as const, ["products", "categories", "stock_batches"]),
    detail: (id: string) => resource(["products", "detail", id] as const, ["products"]),
    basicInfo: (id: string | null) =>
      resource(["products", "basicInfo", id] as const, ["products"]),
    history: (id: string, viewerId?: string) =>
      resource(["productHistory", id, viewerId] as const, ["audit_logs", "stock_movements"]),
    batches: (id?: string) => resource(["productBatches", id] as const, ["stock_batches"]),
    creator: (id?: string) => resource(["productCreator", id] as const, ["audit_logs"]),
    deletionBlockers: (id: string | null) =>
      resource(["productDeletionBlockers", id] as const, [
        "stock_batches",
        "purchase_orders",
        "purchase_order_items",
      ]),
  },
  categories: {
    list: () => resource(["categoryList"] as const, ["categories"]),
  },
  stockBatches: {
    expiring: (expiryDays: number) =>
      resource(["expiringBatches", expiryDays] as const, ["stock_batches", "products"]),
    overview: () => resource(["stockOverviewData"] as const, ["products", "stock_batches"]),
    // getStockBatchStats reads `FROM products p LEFT JOIN (...stock_batches)`, so a product edit/add/deactivate changes these numbers too - withou…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-query-keys-ts-L41
    stats: (expiryDays: number) =>
      resource(["stockBatchStats", expiryDays] as const, ["stock_batches", "products"]),
    // getStockMoM reads stock_movements (30-day added/removed value) and
    // stock_batches (current valuation).
    mom: () => resource(["stockMoM"] as const, ["stock_movements", "stock_batches"]),
    available: () =>
      resource(["availableStockBatches"] as const, ["stock_batches", "products"]),
    forProduct: (productId: string) =>
      resource(["availableStockBatches", productId] as const, ["stock_batches", "products"]),
    lowStockAlerts: () => resource(["lowStockAlerts"] as const, ["stock_batches", "products"]),
    expiryAlerts: () => resource(["expiryAlerts"] as const, ["stock_batches", "products"]),
    oversoldAlerts: () =>
      resource(["oversoldAlerts"] as const, ["stock_movements", "products"]),
    batchDeficits: () =>
      resource(["batchDeficits"] as const, ["stock_movements", "stock_batches", "products"]),
  },
  stockAudits: {
    all: () => resource(["stock_audits"] as const, ["stock_audits"]),
  },
  stockAdjustments: {
    list: (dateRange?: { from?: string; to?: string }, fullHistory?: boolean) =>
      resource(
        ["stockAdjustmentsLedger", dateRange?.from, dateRange?.to, !!fullHistory] as const,
        ["stock_movements"],
      ),
  },
  stockMovements: {
    list: (dateRange?: { from?: string; to?: string }, fullHistory?: boolean) =>
      resource(
        ["stockMovementsLedger", dateRange?.from, dateRange?.to, !!fullHistory] as const,
        ["stock_movements"],
      ),
  },
  sales: {
    recent: (userId?: string, dateRange?: { from?: string; to?: string }) =>
      resource(["recentSales", userId, dateRange?.from, dateRange?.to] as const, ["sales"]),
    recentlySoldIds: () => resource(["recentlySoldIds"] as const, ["sale_items"]),
    commonlySoldIds: () => resource(["commonlySoldIds"] as const, ["sale_items"]),
    saleItems: (saleId?: string) => resource(["saleItems", saleId] as const, ["sale_items"]),
    transactionDetails: (saleId?: string) =>
      resource(["transactionDetails", saleId] as const, ["sale_items", "returns"]),
    fastMovers: () => resource(["fastMovers"] as const, ["sales", "sale_items", "products"]),
  },
  purchaseOrders: {
    all: (viewerId?: string) => resource(["purchase_orders", viewerId] as const, ["purchase_orders"]),
    detail: (id: string | null) =>
      resource(["purchase_order_details", id] as const, [
        "purchase_orders",
        "purchase_order_items",
      ]),
    detailItems: (id: string | null) =>
      resource(["purchase_order_detail_items", id] as const, ["purchase_order_items"]),
    droppedReceiptSignal: (id: string | null) =>
      resource(["purchase_order_dropped_receipt", id] as const, ["purchase_order_items"]),
  },
  requestedProducts: {
    all: () => resource(["requested_products"] as const, ["requested_products"]),
  },
  suppliers: {
    all: () => resource(["suppliers"] as const, ["suppliers"]),
  },
  procurement: {
    suppliersForPO: () => resource(["procurementSuppliersForPO"] as const, ["suppliers"]),
    productsForPO: () =>
      resource(["procurementProductsForPO"] as const, ["products", "stock_batches"]),
  },
  customers: {
    all: () => resource(["customers"] as const, ["customers"]),
    transactions: (fullHistory: boolean, range?: { from?: string; to?: string }) =>
      resource(
        ["customerTransactions", fullHistory, range?.from, range?.to] as const,
        ["sales", "sale_items"],
      ),
    posList: () => resource(["posCustomers"] as const, ["customers"]),
    byId: (customerId: string | null | undefined) =>
      resource(["customerById", customerId] as const, ["customers"]),
  },
  reseller: {
    commissionList: () =>
      resource(["resellerCommission", "list"] as const, ["sales", "customers"]),
    commissionPendingTotal: () =>
      resource(["resellerCommission", "pendingTotal"] as const, ["sales"]),
  },
  expenses: {
    all: () => resource(["expenses"] as const, ["expenses"]),
    // One page of the ledger.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#query-keys-ts-L130
    page: (
      viewerId: string | undefined,
      limit: number,
      search: string | undefined,
      category: string | undefined,
      from?: string,
      to?: string,
    ) =>
      resource(
        [
          "expenses",
          "page",
          viewerId ?? "all",
          limit,
          search ?? "",
          category ?? "All",
          from ?? "",
          to ?? "",
        ] as const,
        ["expenses"],
      ),
    lifetimeTotal: (viewerId: string | undefined) =>
      resource(["expenses", "lifetimeTotal", viewerId ?? "all"] as const, [
        "expenses",
      ]),
    monthStats: (viewerId: string | undefined, from: string, to: string) =>
      resource(
        ["expenses", "monthStats", viewerId ?? "all", from, to] as const,
        ["expenses"],
      ),
  },
  prescriptions: {
    all: () => resource(["prescriptions"] as const, ["prescriptions"]),
    detailItems: (id: string | null) =>
      resource(["prescription_detail_items", id] as const, ["prescription_items"]),
  },
  heldTransactions: {
    all: () => resource(["held_transactions"] as const, ["held_transactions"]),
    count: () => resource(["heldTransactionsCount"] as const, ["held_transactions"]),
  },
  onlineOrders: {
    // Remote API data, not a local table: never invalidated by local
    // mutations, only ever refetched explicitly.
    all: () => resource(["online_orders"] as const, []),
  },
  paymentAccounts: {
    all: (storeId?: string) =>
      resource(["paymentAccounts", storeId] as const, ["payment_accounts"]),
  },
  staff: {
    count: () => resource(["staffCount"] as const, ["users"]),
    users: (storeId?: string | null) =>
      resource(["users", storeId ?? "all"] as const, ["users"]),
  },
  sync: {
    queueCount: () => resource(["syncQueueCount"] as const, ["_sync_queue"]),
    queueBreakdown: () => resource(["syncQueueBreakdown"] as const, ["_sync_queue"]),
    peerFreshness: () => resource(["syncPeerFreshness"] as const, []),
  },
  licensing: {
    status: () => resource(["licenseStatus"] as const, ["stores"]),
  },
  stores: {
    profile: (targetId?: string | null) =>
      resource(["storeProfile", targetId] as const, ["stores"]),
    all: (userStoreId?: string) =>
      resource(["allStores", userStoreId] as const, ["stores"]),
  },
  broadcasts: {
    // Remote API data, not a local table.
    all: (storeId?: string) => resource(["broadcasts", storeId] as const, []),
  },
  notifications: {
    // Remote API data, not a local table.
    all: (storeId?: string) => resource(["cloudNotifications", storeId] as const, []),
  },
  loyalty: {
    tiers: () => resource(["loyalty_tiers"] as const, ["loyalty_tiers"]),
    redemptionOptions: () =>
      resource(["loyalty_redemption_options"] as const, ["loyalty_redemption_options"]),
    customerLedger: (customerId?: string) =>
      resource(["loyalty_transactions", customerId] as const, ["loyalty_transactions"]),
  },
  pos: {
    products: () =>
      resource(["posProducts"] as const, ["products", "categories", "stock_batches"]),
  },
  setup: {
    totalRecordCount: () =>
      resource(["setupData", "totalRecordCount"] as const, ["products", "sales"]),
  },
  dashboard: {
    // Today's local date is part of the key because getDashboardOverviewData computes "today" internally (getLocalTodayDate(), same call as here):
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-query-keys-ts-L220
    overview: (viewerId?: string) =>
      resource(["dashboardOverviewData", viewerId, getLocalTodayDate()] as const, [
        "sales",
        "returns",
        "stock_movements",
        "purchase_orders",
        "expenses",
        "prescriptions",
        "products",
      ]),
  },
  bi: {
    metrics: (dateFilter: string, prevDateFilter: string, staffId?: string, paymentMethod?: string) =>
      resource(["biMetrics", dateFilter, prevDateFilter, staffId, paymentMethod] as const, [
        "sales",
        "sale_items",
        "returns",
        "return_items",
        "expenses",
        "customers",
        "stock_batches",
      ]),
    purchasePatterns: (dateFilter: string, staffId?: string, paymentMethod?: string) =>
      resource(["purchasePatterns", dateFilter, staffId, paymentMethod] as const, [
        "sales",
        "sale_items",
        "products",
        "categories",
      ]),
    monthlySales: (dateFilter: string, staffId?: string, paymentMethod?: string) =>
      resource(["advancedMonthlySalesData", dateFilter, staffId, paymentMethod] as const, [
        "sales",
        "returns",
        "expenses",
      ]),
  },
  dailyClose: {
    data: (reportDate: string) =>
      resource(["dailyCloseData", reportDate] as const, [
        "sales",
        "sale_items",
        "returns",
        "return_items",
      ]),
    cashExpenses: (reportDate: string) =>
      resource(["dailyCloseCashExpenses", reportDate] as const, ["expenses"]),
    dayExpenses: (reportDate: string) =>
      resource(["dailyCloseDayExpenses", reportDate] as const, ["expenses"]),
  },
  activityLog: {
    list: (filtersKey: string) =>
      resource(["activityLog", filtersKey] as const, ["audit_logs"]),
    // tableName distinguishes the full Activity Log page's cache slot (no arg) from a scoped tab's (e.g.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-query-keys-ts-L275
    actions: (tableName?: string) =>
      resource(["activityLogActions", tableName ?? "all"] as const, ["audit_logs"]),
    users: (tableName?: string) =>
      resource(["activityLogUsers", tableName ?? "all"] as const, ["audit_logs", "users"]),
  },
  billing: {
    // Remote API data, not a local table.
    status: () => resource(["billing", "status"] as const, []),
    history: () => resource(["billing", "history"] as const, []),
    referrals: () => resource(["billing", "referrals"] as const, []),
  },
  account: {
    // Remote API data, not a local table.
    currentUser: () => resource(["currentUser"] as const, []),
    sessions: () => resource(["accountSessions"] as const, []),
  },
  fleet: {
    // Remote API data, not a local table.
    stats: () => resource(["fleetStats"] as const, []),
    widgetSnapshot: () => resource(["widgetSnapshot"] as const, []),
  },
  accountManager: {
    // Remote API data, not a local table.
    show: () => resource(["accountManager"] as const, []),
  },
} as const;
