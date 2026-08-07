/**
 * Query-key factory + table-dependency tagging convention.
 *
 * Every entry returns `{ queryKey, meta: { tables } }` — spread straight
 * into useQuery's options (`useQuery({ ...queryKeys.products.all(), queryFn
 * })`). Bundling the key and its table dependencies into the same function
 * means they can't drift apart the way they would if `tables` were passed
 * separately at each call site.
 *
 * `meta.tables` is what base-helpers.ts's mutation helpers use (via a
 * predicate, not prefix-matching) to invalidate exactly the queries that
 * could be affected by a given table's insert/update/delete — including
 * queries that read from several tables at once (dashboard, BI, and
 * daily-close all do), which a plain "queryKey starts with the table name"
 * convention can't express.
 *
 * A query with no `meta.tables` (i.e. not yet migrated to this factory)
 * falls back to being invalidated on every mutation — see base-helpers.ts's
 * invalidateQueriesForTable. That makes adopting this factory incremental
 * and safe: an unmigrated query is never LESS correct than before, only
 * less precisely invalidated.
 */

function resource<K extends readonly unknown[]>(queryKey: K, tables: string[]) {
  return { queryKey, meta: { tables } };
}

export const queryKeys = {
  products: {
    all: () => resource(["products"] as const, ["products"]),
    list: () => resource(["products", "list"] as const, ["products"]),
    withDetails: () =>
      resource(["productsWithDetails"] as const, ["products", "categories", "stock_batches"]),
    detail: (id: string) => resource(["products", "detail", id] as const, ["products"]),
    history: (id: string, viewerId?: string) =>
      resource(["productHistory", id, viewerId] as const, ["audit_logs", "stock_movements"]),
    batches: (id?: string) => resource(["productBatches", id] as const, ["stock_batches"]),
  },
  categories: {
    all: () => resource(["categoriesList"] as const, ["categories"]),
    tree: () => resource(["categoryTree"] as const, ["categories"]),
  },
  stockBatches: {
    expiring: (expiryDays: number) =>
      resource(["expiringBatches", expiryDays] as const, ["stock_batches", "products"]),
    overview: () => resource(["stockOverviewData"] as const, ["products", "stock_batches"]),
    stats: (expiryDays: number) =>
      resource(["stockBatchStats", expiryDays] as const, ["stock_batches"]),
    available: () =>
      resource(["availableStockBatches"] as const, ["stock_batches", "products"]),
    forProduct: (productId: string) =>
      resource(["availableStockBatches", productId] as const, ["stock_batches", "products"]),
    lowStockAlerts: () => resource(["lowStockAlerts"] as const, ["stock_batches", "products"]),
    expiryAlerts: () => resource(["expiryAlerts"] as const, ["stock_batches", "products"]),
  },
  stockAudits: {
    all: () => resource(["stock_audits"] as const, ["stock_audits"]),
  },
  sales: {
    recent: (userId?: string) => resource(["recentSales", userId] as const, ["sales"]),
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
  },
  requestedProducts: {
    all: () => resource(["requested_products"] as const, ["requested_products"]),
  },
  suppliers: {
    all: () => resource(["suppliers"] as const, ["suppliers"]),
  },
  customers: {
    all: () => resource(["customers"] as const, ["customers"]),
    transactions: (fullHistory: boolean) =>
      resource(["customerTransactions", fullHistory] as const, ["sales", "sale_items"]),
    posList: () => resource(["posCustomers"] as const, ["customers"]),
  },
  expenses: {
    all: () => resource(["expenses"] as const, ["expenses"]),
  },
  prescriptions: {
    all: () => resource(["prescriptions"] as const, ["prescriptions"]),
  },
  heldTransactions: {
    all: () => resource(["held_transactions"] as const, ["held_transactions"]),
    count: () => resource(["heldTransactionsCount"] as const, ["held_transactions"]),
  },
  onlineOrders: {
    // Remote API data, not a local table — never invalidated by local
    // mutations, only ever refetched explicitly.
    all: () => resource(["online_orders"] as const, []),
  },
  paymentAccounts: {
    all: (storeId?: string) =>
      resource(["paymentAccounts", storeId] as const, ["payment_accounts"]),
  },
  staff: {
    count: () => resource(["staffCount"] as const, ["users"]),
    users: () => resource(["users"] as const, ["users"]),
  },
  sync: {
    queueCount: () => resource(["syncQueueCount"] as const, ["_sync_queue"]),
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
  loyalty: {
    tiers: () => resource(["loyalty_tiers"] as const, ["loyalty_tiers"]),
    redemptionOptions: () =>
      resource(["loyalty_redemption_options"] as const, ["loyalty_redemption_options"]),
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
    overview: (viewerId?: string) =>
      resource(["dashboardOverviewData", viewerId] as const, [
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
    metrics: (dateFilter: string, prevDateFilter: string) =>
      resource(["biMetrics", dateFilter, prevDateFilter] as const, [
        "sales",
        "sale_items",
        "returns",
        "return_items",
        "expenses",
        "customers",
        "stock_batches",
      ]),
    purchasePatterns: (dateFilter: string) =>
      resource(["purchasePatterns", dateFilter] as const, [
        "sales",
        "sale_items",
        "products",
        "categories",
      ]),
    monthlySales: (dateFilter: string) =>
      resource(["advancedMonthlySalesData", dateFilter] as const, [
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
  },
} as const;
