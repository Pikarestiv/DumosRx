export { seedMedicines } from "./seeds/medicines";
export { seedSales } from "./seeds/sales";
/**
 * Seed data definitions for local SQLite database.
 * Each category is independently seedable.
 */

export type SeedKey = "medicines" | "suppliers" | "expenses" | "sales" | "customers" | "users";

export interface SeedCategory {
  id: string;
  label: string;
  description: string;
  tables: string[]; // tables to clean before seeding
  seed: (cashierId: string) => Promise<void>;
}

export const SEED_CATEGORIES: { key: SeedKey; label: string; description: string }[] = [
  { key: "medicines", label: "Medicines", description: "22 sample medicines with varied stock & expiry scenarios" },
  { key: "suppliers", label: "Suppliers", description: "2 sample suppliers (Emzor, GSK Nigeria)" },
  { key: "expenses", label: "Expenses", description: "1 sample rent expense" },
  { key: "sales", label: "Sales & Items", description: "2 sample completed sales with detailed items" },
  { key: "customers", label: "Customers", description: "3 sample customers with varying loyalty and credit history" },
  { key: "users", label: "Staff Users", description: "1 default admin user (admin / 1234)" },
];

// Lazy-import DB helpers inside seed fns to avoid SSR issues
async function db() {
  const mod = await import("@/lib/db/local-database");
  return mod;
}

export async function seedSuppliers() {
  const { insert, execute } = await db();
  await execute("DELETE FROM suppliers WHERE id IN ('v1', 'v2')");
  await execute("DELETE FROM vendors WHERE id IN ('v1', 'v2')");

  await insert("suppliers", {
    id: "v1",
    name: "Emzor Pharmaceuticals",
    contact_person: "Mr. Emeka",
    phone: "08033344455",
    email: "emeka@emzorpharma.com",
    address: "Plot 3C, Block A, Isolo Industrial Estate, Lagos",
    payment_terms: "30",
    is_active: 1,
  });
  await insert("suppliers", {
    id: "v2",
    name: "GSK Nigeria",
    contact_person: "Sarah Okon",
    phone: "08099887766",
    email: "sarah.okon@gsk.com",
    address: "1 Industrial Avenue, Ilupeju, Lagos",
    payment_terms: "0",
    is_active: 1,
  });

  await insert("vendors", {
    id: "v1",
    name: "Emzor Pharmaceuticals",
    contact_person: "Mr. Emeka",
    phone: "08033344455",
    email: "emeka@emzorpharma.com",
    address: "Plot 3C, Block A, Isolo Industrial Estate, Lagos",
    payment_terms: "30",
    rating: 4.8,
    is_active: 1,
  });
  await insert("vendors", {
    id: "v2",
    name: "GSK Nigeria",
    contact_person: "Sarah Okon",
    phone: "08099887766",
    email: "sarah.okon@gsk.com",
    address: "1 Industrial Avenue, Ilupeju, Lagos",
    payment_terms: "0",
    rating: 4.5,
    is_active: 1,
  });
}

export async function seedExpenses() {
  const { insert, execute } = await db();
  await execute("DELETE FROM expenses WHERE id IN ('e1')");
  await insert("expenses", {
    id: "e1",
    category: "Rent",
    amount: 150000,
    description: "Monthly shop rent",
    date: new Date().toISOString().split("T")[0],
    payment_method: "Bank Transfer",
    vendor_name: "Isolo Properties",
    reference_number: "REF-RENT-2026",
  });
}

export async function seedCustomers() {
  const { insert, execute } = await db();
  await execute("DELETE FROM customers WHERE id IN ('c1', 'c2', 'c3')");
  
  const today = new Date().toISOString();
  
  await insert("customers", {
    id: "c1",
    first_name: "John",
    last_name: "Doe",
    email: "john.doe@gmail.com",
    phone: "08012345678",
    address: "12 Admiralty Way, Lekki Phase 1, Lagos",
    date_of_birth: "1988-11-23",
    gender: "male",
    allergies: "Penicillin",
    medical_conditions: "Hypertension",
    credit_limit: 50000,
    outstanding_balance: 0,
    loyalty_points: 150,
    notes: "Regular customer, check for penicillin allergy before dispensing antibiotics.",
    is_active: 1,
    created_at: today,
    updated_at: today,
  });

  await insert("customers", {
    id: "c2",
    first_name: "Jane",
    last_name: "Smith",
    email: "jane.smith@yahoo.com",
    phone: "08098765432",
    address: "45 Toyin Street, Ikeja, Lagos",
    date_of_birth: "1992-04-12",
    gender: "female",
    allergies: "Sulfa drugs",
    medical_conditions: "Asthma",
    credit_limit: 100000,
    outstanding_balance: 45000,
    loyalty_points: 420,
    notes: "Chronic asthma patient. Prefers brand-name inhalers.",
    is_active: 1,
    created_at: today,
    updated_at: today,
  });

  await insert("customers", {
    id: "c3",
    first_name: "Alhaji",
    last_name: "Musa",
    email: "alhaji.musa@outlook.com",
    phone: "08123459876",
    address: "78 Aminu Kano Crescent, Wuse 2, Abuja",
    date_of_birth: "1965-08-30",
    gender: "male",
    allergies: "None",
    medical_conditions: "Type 2 Diabetes",
    credit_limit: 20000,
    outstanding_balance: 0,
    loyalty_points: 0,
    notes: "Walk-in credit account, usually pays cash immediately.",
    is_active: 1,
    created_at: today,
    updated_at: today,
  });
}

export async function seedUsers() {
  const { insert, execute } = await db();
  await execute("DELETE FROM users WHERE id IN ('u1')");
  await insert("users", {
    id: "u1",
    name: "Default Admin",
    username: "admin",
    email: "admin@dumosrx.com",
    pin: "1234",
    role: "admin",
    is_active: 1,
  });
}

export async function resetMedicines() {
  const { execute } = await db();
  await execute("DELETE FROM medicines");
  await execute("DELETE FROM inventory");
  await execute("DELETE FROM categories");
}

export async function resetSuppliers() {
  const { execute } = await db();
  await execute("DELETE FROM suppliers");
  await execute("DELETE FROM vendors");
}

export async function resetExpenses() {
  const { execute } = await db();
  await execute("DELETE FROM expenses");
}

export async function resetSales() {
  const { execute } = await db();
  await execute("DELETE FROM sales");
  await execute("DELETE FROM sale_items");
  await execute("DELETE FROM returns");
  await execute("DELETE FROM held_transactions");
  await execute("DELETE FROM loyalty_transactions");
}

export async function resetCustomers() {
  const { execute } = await db();
  await execute("DELETE FROM customers");
  await execute("DELETE FROM customer_payments");
}

export async function resetUsers() {
  const { execute } = await db();
  await execute("DELETE FROM users");
  await seedUsers();
}

export async function resetAll() {
  const { execute } = await db();
  const tables = [
    "medicines",
    "inventory",
    "categories",
    "suppliers",
    "vendors",
    "expenses",
    "sales",
    "sale_items",
    "returns",
    "held_transactions",
    "loyalty_transactions",
    "customers",
    "customer_payments",
    "prescriptions",
    "prescription_items",
    "purchase_orders",
    "purchase_order_items",
    "stock_audits",
    "audit_logs",
    "feedback",
    "_sync_queue",
    "_sync_state",
    "store_profile",
  ];
  for (const table of tables) {
    try {
      await execute(`DELETE FROM ${table}`);
    } catch (e) {
      console.warn(`Could not delete from ${table}:`, e);
    }
  }
  await seedUsers();
}
