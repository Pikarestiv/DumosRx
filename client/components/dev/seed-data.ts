/**
 * Seed data definitions for local SQLite database.
 * Each category is independently seedable.
 */

export interface SeedCategory {
  id: string;
  label: string;
  description: string;
  tables: string[]; // tables to clean before seeding
  seed: (cashierId: string) => Promise<void>;
}

// Lazy-import DB helpers inside seed fns to avoid SSR issues
async function db() {
  const mod = await import("@/lib/db/local-database");
  return mod;
}

export async function seedMedicines() {
  const { insert, execute } = await db();
  await execute("DELETE FROM medicines WHERE id IN ('m1', 'm2', 'm3')");
  await insert("medicines", {
    id: "m1",
    name: "Paracetamol",
    brand_name: "Emzor",
    category_id: "Analgesics",
    stock_quantity: 500,
    base_unit: "Tablet",
    bulk_unit: "Pack",
    units_per_bulk: 50,
    is_active: 1,
  });
  await insert("medicines", {
    id: "m2",
    name: "Amoxicillin",
    brand_name: "Beecham",
    category_id: "Antibiotics",
    stock_quantity: 120,
    base_unit: "Capsule",
    bulk_unit: "Carton",
    units_per_bulk: 100,
    is_active: 1,
  });
  await insert("medicines", {
    id: "m3",
    name: "Vitamin C",
    brand_name: "Emzor",
    category_id: "Vitamins",
    stock_quantity: 50,
    base_unit: "Sachet",
    is_active: 1,
    reorder_level: 100,
  });
}

export async function seedSuppliers() {
  const { insert, execute } = await db();
  await execute("DELETE FROM suppliers WHERE id IN ('v1', 'v2')");
  await insert("suppliers", {
    id: "v1",
    name: "Emzor Pharmaceuticals",
    contact_person: "Mr. Emeka",
    phone: "08033344455",
    payment_terms: "Net 30",
  });
  await insert("suppliers", {
    id: "v2",
    name: "GSK Nigeria",
    contact_person: "Sarah Okon",
    phone: "08099887766",
    payment_terms: "Pay on Delivery",
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
  });
}

export async function seedSales(cashierId: string) {
  const { insert, execute } = await db();
  await execute("DELETE FROM sales WHERE id IN ('s1', 's2')");
  const today = new Date().toISOString();
  const base = {
    user_id: cashierId,
    tax_amount: 0,
    tax_percentage: 7.5,
    discount_total: 0,
    discount_percentage: 0,
    points_earned: 0,
    points_redeemed: 0,
    change_given: 0,
    created_at: today,
    transaction_date: today,
    payment_status: "completed",
    receipt_printed: 0,
  };
  await insert("sales", {
    ...base,
    id: "s1",
    transaction_number: "TRX-SEED-001",
    total_amount: 1500,
    amount_paid: 1500,
    subtotal: 1500,
    payment_method: "cash",
  });
  await insert("sales", {
    ...base,
    id: "s2",
    transaction_number: "TRX-SEED-002",
    total_amount: 2500,
    amount_paid: 2500,
    subtotal: 2500,
    payment_method: "card",
  });
}

export async function seedCustomers() {
  const { insert, execute } = await db();
  await execute("DELETE FROM customers WHERE id IN ('c1')");
  await insert("customers", {
    id: "c1",
    first_name: "John",
    last_name: "Doe",
    phone: "08012345678",
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
