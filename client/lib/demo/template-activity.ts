/**
 * Demo activity data: customers, sales, expenses, staff, and in-flight
 * purchase orders. Split out from template.ts purely to stay under the
 * project's max-lines lint rule; see template.ts for the catalog
 * (categories/supplier/products/receiving plan) this data references by ref.
 */

export interface DemoCustomer {
  ref: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  loyalty_points?: number;
  outstanding_balance?: number;
}

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  { ref: "adaeze", first_name: "Adaeze", last_name: "Chukwu", email: "adaeze.chukwu@example.com", phone: "+234 802 111 2233", loyalty_points: 150 },
  { ref: "emeka", first_name: "Emeka", last_name: "Balogun", email: "emeka.balogun@example.com", phone: "+234 803 222 3344", loyalty_points: 40 },
  { ref: "fatima", first_name: "Fatima", last_name: "Bello", email: "fatima.bello@example.com", phone: "+234 805 333 4455", loyalty_points: 10, outstanding_balance: 3500 },
  { ref: "josh", first_name: "Josh", last_name: "Odumodu", phone: "+234 806 444 5566", loyalty_points: 0 },
];

export interface DemoSaleItem {
  productRef: string;
  quantity: number;
}

export interface DemoSale {
  customerRef?: string;
  dayOffset: number;
  paymentMethod: "cash" | "card" | "transfer" | "credit" | "mixed";
  paymentStatus: "completed" | "pending" | "refunded";
  taxPercentage: 0 | 10;
  items: DemoSaleItem[];
  /** When set, this sale is refunded right after creation via a real return. */
  refund?: boolean;
}

export const DEMO_SALES: DemoSale[] = [
  { dayOffset: 13, paymentMethod: "cash", paymentStatus: "completed", taxPercentage: 0, items: [{ productRef: "panadol_extra", quantity: 2 }] },
  { customerRef: "adaeze", dayOffset: 12, paymentMethod: "card", paymentStatus: "completed", taxPercentage: 0, items: [{ productRef: "coartem", quantity: 1 }, { productRef: "zyrtec", quantity: 1 }] },
  { dayOffset: 11, paymentMethod: "transfer", paymentStatus: "completed", taxPercentage: 0, items: [{ productRef: "benylin", quantity: 1 }] },
  { customerRef: "emeka", dayOffset: 10, paymentMethod: "cash", paymentStatus: "completed", taxPercentage: 0, items: [{ productRef: "gaviscon", quantity: 1 }, { productRef: "omeprazole", quantity: 1 }] },
  { dayOffset: 9, paymentMethod: "card", paymentStatus: "completed", taxPercentage: 10, items: [{ productRef: "augmentin_625", quantity: 1 }] },
  { customerRef: "fatima", dayOffset: 8, paymentMethod: "credit", paymentStatus: "pending", taxPercentage: 0, items: [{ productRef: "norvasc", quantity: 2 }, { productRef: "glucophage", quantity: 1 }] },
  { dayOffset: 7, paymentMethod: "cash", paymentStatus: "completed", taxPercentage: 0, items: [{ productRef: "dettol", quantity: 2 }] },
  { customerRef: "josh", dayOffset: 6, paymentMethod: "mixed", paymentStatus: "completed", taxPercentage: 0, items: [{ productRef: "loratadine", quantity: 1 }, { productRef: "flagyl_400", quantity: 1 }] },
  { dayOffset: 5, paymentMethod: "card", paymentStatus: "completed", taxPercentage: 10, items: [{ productRef: "ventolin", quantity: 1 }] },
  { customerRef: "adaeze", dayOffset: 4, paymentMethod: "transfer", paymentStatus: "completed", taxPercentage: 0, items: [{ productRef: "panadol_extra", quantity: 1 }, { productRef: "emzor_vitc", quantity: 3 }] },
  { dayOffset: 3, paymentMethod: "cash", paymentStatus: "completed", taxPercentage: 0, items: [{ productRef: "zyrtec", quantity: 1 }], refund: true },
  { dayOffset: 1, paymentMethod: "cash", paymentStatus: "completed", taxPercentage: 0, items: [{ productRef: "coartem", quantity: 1 }] },
];

export interface DemoExpense {
  category: string;
  description: string;
  amount: number;
  dayOffset: number;
  paymentMethod: string;
  coversMonths?: number;
}

export const DEMO_EXPENSES: DemoExpense[] = [
  { category: "Rent", description: "Shop rent, annual lease", amount: 1200000, dayOffset: 200, paymentMethod: "Transfer", coversMonths: 12 },
  { category: "Insurance", description: "Business & stock insurance, annual premium", amount: 360000, dayOffset: 300, paymentMethod: "Transfer", coversMonths: 12 },
  { category: "Salaries", description: "Staff salaries", amount: 250000, dayOffset: 60, paymentMethod: "Transfer" },
  { category: "Salaries", description: "Staff salaries", amount: 250000, dayOffset: 30, paymentMethod: "Transfer" },
  { category: "Salaries", description: "Staff salaries", amount: 250000, dayOffset: 2, paymentMethod: "Transfer" },
  { category: "Utilities", description: "Electricity bill", amount: 45000, dayOffset: 15, paymentMethod: "Cash" },
  { category: "Maintenance", description: "Laptop repair", amount: 10000, dayOffset: 17, paymentMethod: "Cash" },
  { category: "Marketing", description: "Flyers & local radio ad", amount: 30000, dayOffset: 25, paymentMethod: "Card" },
];

export const DEMO_STAFF = {
  first_name: "Demo",
  last_name: "Cashier",
  username: "demo_cashier",
  pin: "1234",
  role: "sales_staff",
};

/** Two purchase orders left mid-pipeline (not received) so the procurement
 * screen shows a realistic in-flight state, not just a fully-settled one. */
export const DEMO_INFLIGHT_POS: {
  productRef: string;
  bulkQuantity: number;
  dayOffset: number;
  status: "sent" | "pending";
}[] = [
  { productRef: "panadol_extra", bulkQuantity: 3, dayOffset: 5, status: "sent" },
  { productRef: "coartem", bulkQuantity: 5, dayOffset: 2, status: "pending" },
];
