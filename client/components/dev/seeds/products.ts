export async function seedProducts() {
  const mod = await import("@/lib/db/local-database");
  const { insert, execute } = mod;
  const { CATEGORIES_SEED_DATA, getProductsSeedData } = await import("./products-data");
  
  // Clean up
  await execute("DELETE FROM categories WHERE id IN ('cat1', 'cat2', 'cat3', 'cat4', 'cat5')");
  await execute(`DELETE FROM products WHERE id IN (
    'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10',
    'm11', 'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20',
    'm21', 'm22'
  )`);
  await execute(`DELETE FROM stock_batches WHERE product_id IN (
    'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10',
    'm11', 'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20',
    'm21', 'm22'
  )`);
  await execute("DELETE FROM _sync_queue WHERE table_name IN ('categories', 'products', 'stock_batches')");

  // Seed Categories
  for (const cat of CATEGORIES_SEED_DATA) {
    await insert("categories", cat);
  }

  const today = new Date();
  const getFutureDate = (days: number) => {
    const d = new Date();
    d.setDate(today.getDate() + days);
    return d.toISOString().split("T")[0];
  };
  const getPastDate = (days: number) => {
    const d = new Date();
    d.setDate(today.getDate() - days);
    return d.toISOString().split("T")[0];
  };

  const nowString = today.toISOString();

  const addMed = async (med: any, batches: any[]) => {
    const medPayload = { ...med };
    delete medPayload.cost_price; // products table no longer has cost_price

    await insert("products", {
      ...medPayload,
      created_at: nowString,
      updated_at: nowString,
      is_active: 1,
      _version: 1,
      _synced: 0,
    });
    for (const b of batches) {
      await insert("stock_batches", {
        ...b,
        product_id: med.id,
        created_at: nowString,
        updated_at: nowString,
        is_active: 1,
        _version: 1,
        _synced: 0,
      });
    }
  };

  const productsData = getProductsSeedData(getFutureDate, getPastDate);
  for (const item of productsData) {
    await addMed(item.med, item.batches);
  }
}
