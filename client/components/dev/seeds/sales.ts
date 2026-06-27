export async function seedSales(cashierId: string) {
  const mod = await import("@/lib/db/local-database");
  const { insert, execute } = mod;
  
  // Clean up
  await execute("DELETE FROM sales WHERE id IN ('s1', 's2')");
  await execute("DELETE FROM sale_items WHERE sale_id IN ('s1', 's2')");
  await execute("DELETE FROM _sync_queue WHERE table_name IN ('sales', 'sale_items')");
  
  const today = new Date();
  const getPastDateTime = (days: number) => {
    const d = new Date();
    d.setDate(today.getDate() - days);
    return d.toISOString();
  };
  
  // s1: Cash sale, 2 days ago
  const dateS1 = getPastDateTime(2);
  await insert("sales", {
    id: "s1",
    transaction_number: "TRX-SEED-001",
    customer_id: "c1",
    user_id: cashierId,
    subtotal: 390,
    tax_amount: 29.25,
    tax_percentage: 7.5,
    discount_total: 9.25,
    discount_percentage: 0,
    total_amount: 410,
    amount_paid: 500,
    change_given: 90,
    payment_method: "cash",
    payment_status: "completed",
    transaction_date: dateS1,
    receipt_printed: 0,
    notes: "Regular customer purchase",
    created_at: dateS1,
    updated_at: dateS1,
  });

  await insert("sale_items", {
    id: "si1",
    sale_id: "s1",
    product_id: "m1",
    stock_batch_id: "inv-m1-b1",
    quantity: 10,
    unit_price: 15,
    cost_price: 10,
    discount_amount: 0,
    total_price: 150,
    created_at: dateS1,
    updated_at: dateS1,
  });

  await insert("sale_items", {
    id: "si2",
    sale_id: "s1",
    product_id: "m2",
    stock_batch_id: "inv-m2-b1",
    quantity: 2,
    unit_price: 120,
    cost_price: 80,
    discount_amount: 0,
    total_price: 240,
    created_at: dateS1,
    updated_at: dateS1,
  });

  // s2: Card sale, 1 day ago
  const dateS2 = getPastDateTime(1);
  await insert("sales", {
    id: "s2",
    transaction_number: "TRX-SEED-002",
    customer_id: "c2",
    user_id: cashierId,
    subtotal: 5040,
    tax_amount: 378,
    tax_percentage: 7.5,
    discount_total: 18,
    discount_percentage: 0,
    total_amount: 5400,
    amount_paid: 5400,
    change_given: 0,
    payment_method: "card",
    payment_status: "completed",
    transaction_date: dateS2,
    receipt_printed: 0,
    notes: "Card payment at POS",
    created_at: dateS2,
    updated_at: dateS2,
  });

  await insert("sale_items", {
    id: "si3",
    sale_id: "s2",
    product_id: "m3",
    stock_batch_id: "inv-m3-b1",
    quantity: 5,
    unit_price: 8,
    cost_price: 5,
    discount_amount: 0,
    total_price: 40,
    created_at: dateS2,
    updated_at: dateS2,
  });

  await insert("sale_items", {
    id: "si4",
    sale_id: "s2",
    product_id: "m6",
    stock_batch_id: "inv-m6-b1",
    quantity: 1,
    unit_price: 5000,
    cost_price: 3500,
    discount_amount: 0,
    total_price: 5000,
    created_at: dateS2,
    updated_at: dateS2,
  });
}

