/* eslint-disable max-lines */
export async function seedMedicines() {
  const mod = await import("@/lib/db/local-database");
  const { insert, execute } = mod;
  
  // Clean up
  await execute("DELETE FROM categories WHERE id IN ('cat1', 'cat2', 'cat3', 'cat4', 'cat5')");
  await execute(`DELETE FROM medicines WHERE id IN (
    'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10',
    'm11', 'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20',
    'm21', 'm22'
  )`);
  await execute(`DELETE FROM inventory WHERE medicine_id IN (
    'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10',
    'm11', 'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20',
    'm21', 'm22'
  )`);

  // Seed Categories
  await insert("categories", { id: "cat1", name: "Analgesics", description: "Pain relievers and fever reducers" });
  await insert("categories", { id: "cat2", name: "Antibiotics", description: "Medications for bacterial infections" });
  await insert("categories", { id: "cat3", name: "Antimalarials", description: "Malaria prevention and treatment" });
  await insert("categories", { id: "cat4", name: "Vitamins", description: "Dietary supplements and vitamins" });
  await insert("categories", { id: "cat5", name: "Antacids", description: "Heartburn and acid reflux relief" });

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

  // Helper to insert medicine and its batch inventory
  const addMed = async (med: any, batches: any[]) => {
    await insert("medicines", {
      ...med,
      created_at: nowString,
      updated_at: nowString,
      is_active: 1,
      _version: 1,
      _synced: 0,
    });
    for (const b of batches) {
      await insert("inventory", {
        ...b,
        medicine_id: med.id,
        created_at: nowString,
        updated_at: nowString,
        is_active: 1,
        _version: 1,
        _synced: 0,
      });
    }
  };

  // 1. Paracetamol 500mg (Analgesic) - Healthy stock, long expiry
  await addMed({
    id: "m1",
    name: "Paracetamol 500mg",
    generic_name: "Acetaminophen",
    brand_name: "Emzor",
    category_id: "Analgesics",
    manufacturer: "Emzor Pharmaceuticals",
    supplier_id: "Emzor Pharmaceuticals",
    nafdac_number: "04-1234",
    dosage_form: "Tablet",
    strength: "500mg",
    cost_price: 10,
    selling_price: 15,
    stock_quantity: 500,
    reorder_level: 50,
    base_unit: "Tablet",
    bulk_unit: "Pack",
    units_per_bulk: 100,
    expiry_date: getFutureDate(500),
    batch_number: "B-PARA-001",
  }, [
    { id: "inv-m1-b1", batch_number: "B-PARA-001", expiry_date: getFutureDate(500), quantity: 300, cost_price: 10, selling_price: 15 },
    { id: "inv-m1-b2", batch_number: "B-PARA-002", expiry_date: getFutureDate(600), quantity: 200, cost_price: 10, selling_price: 15 },
  ]);

  // 2. Amoxicillin 500mg (Antibiotic) - Healthy stock, long expiry
  await addMed({
    id: "m2",
    name: "Amoxicillin 500mg",
    generic_name: "Amoxicillin Trihydrate",
    brand_name: "Beecham",
    category_id: "Antibiotics",
    manufacturer: "GSK Nigeria",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-5678",
    dosage_form: "Capsule",
    strength: "500mg",
    cost_price: 80,
    selling_price: 120,
    stock_quantity: 120,
    reorder_level: 30,
    base_unit: "Capsule",
    bulk_unit: "Carton",
    units_per_bulk: 100,
    expiry_date: getFutureDate(400),
    batch_number: "B-AMOX-01",
  }, [
    { id: "inv-m2-b1", batch_number: "B-AMOX-01", expiry_date: getFutureDate(400), quantity: 120, cost_price: 80, selling_price: 120 },
  ]);

  // 3. Vitamin C 100mg (Vitamin) - Low stock, long expiry
  await addMed({
    id: "m3",
    name: "Vitamin C 100mg",
    generic_name: "Ascorbic Acid",
    brand_name: "Emzor",
    category_id: "Vitamins",
    manufacturer: "Emzor Pharmaceuticals",
    supplier_id: "Emzor Pharmaceuticals",
    nafdac_number: "04-2468",
    dosage_form: "Sachet",
    strength: "100mg",
    cost_price: 5,
    selling_price: 8,
    stock_quantity: 8,
    reorder_level: 20,
    base_unit: "Sachet",
    expiry_date: getFutureDate(600),
    batch_number: "B-VITC-99",
  }, [
    { id: "inv-m3-b1", batch_number: "B-VITC-99", expiry_date: getFutureDate(600), quantity: 8, cost_price: 5, selling_price: 8 },
  ]);

  // 4. Coartem 80/480mg (Antimalarial) - Healthy stock, expired
  await addMed({
    id: "m4",
    name: "Coartem 80/480mg",
    generic_name: "Artemether + Lumefantrine",
    brand_name: "Novartis",
    category_id: "Antimalarials",
    manufacturer: "Novartis AG",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-1357",
    dosage_form: "Tablet",
    strength: "80/480mg",
    cost_price: 1200,
    selling_price: 1800,
    stock_quantity: 50,
    reorder_level: 15,
    base_unit: "Tablet",
    expiry_date: getPastDate(60),
    batch_number: "B-COAR-EX",
  }, [
    { id: "inv-m4-b1", batch_number: "B-COAR-EX", expiry_date: getPastDate(60), quantity: 50, cost_price: 1200, selling_price: 1800 },
  ]);

  // 5. Cough Syrup (Analgesic) - Zero stock, long expiry
  await addMed({
    id: "m5",
    name: "Benylin Cough Syrup",
    generic_name: "Diphenhydramine",
    brand_name: "Benylin",
    category_id: "Analgesics",
    manufacturer: "Johnson & Johnson",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-9876",
    dosage_form: "Syrup",
    strength: "100ml",
    cost_price: 450,
    selling_price: 650,
    stock_quantity: 0,
    reorder_level: 10,
    base_unit: "Bottle",
    expiry_date: getFutureDate(300),
    batch_number: "B-COUG-00",
  }, [
    { id: "inv-m5-b1", batch_number: "B-COUG-00", expiry_date: getFutureDate(300), quantity: 0, cost_price: 450, selling_price: 650 },
  ]);

  // 6. Augmentin 625mg (Antibiotic) - Healthy stock, expiring soon
  await addMed({
    id: "m6",
    name: "Augmentin 625mg",
    generic_name: "Amoxicillin + Clavulanate",
    brand_name: "GSK",
    category_id: "Antibiotics",
    manufacturer: "GlaxoSmithKline",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-1122",
    dosage_form: "Tablet",
    strength: "625mg",
    cost_price: 3500,
    selling_price: 5000,
    stock_quantity: 25,
    reorder_level: 10,
    base_unit: "Tablet",
    expiry_date: getFutureDate(45),
    batch_number: "B-AUGM-NE",
  }, [
    { id: "inv-m6-b1", batch_number: "B-AUGM-NE", expiry_date: getFutureDate(45), quantity: 25, cost_price: 3500, selling_price: 5000 },
  ]);

  // 7. Loratadine 10mg (Analgesic) - Zero stock & expired
  await addMed({
    id: "m7",
    name: "Loratadine 10mg",
    generic_name: "Loratadine",
    brand_name: "Claritin",
    category_id: "Analgesics",
    manufacturer: "Bayer",
    supplier_id: "Emzor Pharmaceuticals",
    nafdac_number: "04-3344",
    dosage_form: "Tablet",
    strength: "10mg",
    cost_price: 150,
    selling_price: 250,
    stock_quantity: 0,
    reorder_level: 15,
    base_unit: "Tablet",
    expiry_date: getPastDate(15),
    batch_number: "B-LORA-EX",
  }, [
    { id: "inv-m7-b1", batch_number: "B-LORA-EX", expiry_date: getPastDate(15), quantity: 0, cost_price: 150, selling_price: 250 },
  ]);

  // 8. Omeprazole 20mg (Antacid) - Low stock & expiring soon
  await addMed({
    id: "m8",
    name: "Omeprazole 20mg",
    generic_name: "Omeprazole",
    brand_name: "Sandoz",
    category_id: "Antacids",
    manufacturer: "Sandoz",
    supplier_id: "Emzor Pharmaceuticals",
    nafdac_number: "04-5566",
    dosage_form: "Capsule",
    strength: "20mg",
    cost_price: 300,
    selling_price: 450,
    stock_quantity: 3,
    reorder_level: 10,
    base_unit: "Capsule",
    expiry_date: getFutureDate(12),
    batch_number: "B-OMEP-NE",
  }, [
    { id: "inv-m8-b1", batch_number: "B-OMEP-NE", expiry_date: getFutureDate(12), quantity: 3, cost_price: 300, selling_price: 450 },
  ]);

  // 9. Panadol Extra (Analgesic) - Healthy stock, long expiry
  await addMed({
    id: "m9",
    name: "Panadol Extra",
    generic_name: "Acetaminophen + Caffeine",
    brand_name: "GSK",
    category_id: "Analgesics",
    manufacturer: "GlaxoSmithKline",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-7788",
    dosage_form: "Tablet",
    strength: "500mg/65mg",
    cost_price: 15,
    selling_price: 25,
    stock_quantity: 300,
    reorder_level: 50,
    base_unit: "Tablet",
    expiry_date: getFutureDate(700),
    batch_number: "B-PANA-EXT",
  }, [
    { id: "inv-m9-b1", batch_number: "B-PANA-EXT", expiry_date: getFutureDate(700), quantity: 300, cost_price: 15, selling_price: 25 },
  ]);

  // 10. Artemether Injection (Antimalarial) - Healthy stock, prescription required
  await addMed({
    id: "m10",
    name: "Artemether Injection",
    generic_name: "Artemether",
    brand_name: "ChiPharma",
    category_id: "Antimalarials",
    manufacturer: "Chi Pharmaceuticals",
    supplier_id: "Emzor Pharmaceuticals",
    nafdac_number: "04-9900",
    dosage_form: "Injection",
    strength: "80mg/ml",
    cost_price: 800,
    selling_price: 1200,
    stock_quantity: 40,
    reorder_level: 10,
    base_unit: "Ampoule",
    requires_prescription: 1,
    expiry_date: getFutureDate(800),
    batch_number: "B-ARTE-INJ",
  }, [
    { id: "inv-m10-b1", batch_number: "B-ARTE-INJ", expiry_date: getFutureDate(800), quantity: 40, cost_price: 800, selling_price: 1200 },
  ]);

  // 11. Metformin 500mg (Vitamins/Diabetes) - Healthy stock, long expiry
  await addMed({
    id: "m11",
    name: "Metformin 500mg",
    generic_name: "Metformin Hydrochloride",
    brand_name: "Glucophage",
    category_id: "Vitamins",
    manufacturer: "Merck",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-4321",
    dosage_form: "Tablet",
    strength: "500mg",
    cost_price: 25,
    selling_price: 40,
    stock_quantity: 250,
    reorder_level: 40,
    base_unit: "Tablet",
    expiry_date: getFutureDate(600),
    batch_number: "B-METF-01",
  }, [
    { id: "inv-m11-b1", batch_number: "B-METF-01", expiry_date: getFutureDate(600), quantity: 250, cost_price: 25, selling_price: 40 },
  ]);

  // 12. Amlodipine 5mg (Analgesics/Hypertension) - Low stock, long expiry
  await addMed({
    id: "m12",
    name: "Amlodipine 5mg",
    generic_name: "Amlodipine Besylate",
    brand_name: "Norvasc",
    category_id: "Analgesics",
    manufacturer: "Pfizer",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-8765",
    dosage_form: "Tablet",
    strength: "5mg",
    cost_price: 50,
    selling_price: 80,
    stock_quantity: 5,
    reorder_level: 15,
    base_unit: "Tablet",
    expiry_date: getFutureDate(450),
    batch_number: "B-AMLO-01",
  }, [
    { id: "inv-m12-b1", batch_number: "B-AMLO-01", expiry_date: getFutureDate(450), quantity: 5, cost_price: 50, selling_price: 80 },
  ]);

  // 13. Ciprofloxacin 500mg (Antibiotic) - Healthy stock, expired
  await addMed({
    id: "m13",
    name: "Ciprofloxacin 500mg",
    generic_name: "Ciprofloxacin Hydrochloride",
    brand_name: "Cipro",
    category_id: "Antibiotics",
    manufacturer: "Fidson Healthcare",
    supplier_id: "Emzor Pharmaceuticals",
    nafdac_number: "04-5432",
    dosage_form: "Tablet",
    strength: "500mg",
    cost_price: 450,
    selling_price: 700,
    stock_quantity: 80,
    reorder_level: 15,
    base_unit: "Tablet",
    expiry_date: getPastDate(100),
    batch_number: "B-CIPR-EX",
  }, [
    { id: "inv-m13-b1", batch_number: "B-CIPR-EX", expiry_date: getPastDate(100), quantity: 80, cost_price: 450, selling_price: 700 },
  ]);

  // 14. Ibuprofen 400mg (Analgesic) - Healthy stock, long expiry
  await addMed({
    id: "m14",
    name: "Ibuprofen 400mg",
    generic_name: "Ibuprofen",
    brand_name: "M&B",
    category_id: "Analgesics",
    manufacturer: "May & Baker",
    supplier_id: "Emzor Pharmaceuticals",
    nafdac_number: "04-9898",
    dosage_form: "Tablet",
    strength: "400mg",
    cost_price: 12,
    selling_price: 20,
    stock_quantity: 150,
    reorder_level: 35,
    base_unit: "Tablet",
    expiry_date: getFutureDate(550),
    batch_number: "B-IBUP-01",
  }, [
    { id: "inv-m14-b1", batch_number: "B-IBUP-01", expiry_date: getFutureDate(550), quantity: 150, cost_price: 12, selling_price: 20 },
  ]);

  // 15. Multivitamin Tablets (Vitamin) - Healthy stock, expiring soon
  await addMed({
    id: "m15",
    name: "Multivitamin Tablets",
    generic_name: "Vitamins A-Z",
    brand_name: "Vitabiotics",
    category_id: "Vitamins",
    manufacturer: "Vitabiotics",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-1212",
    dosage_form: "Tablet",
    strength: "100g",
    cost_price: 1500,
    selling_price: 2200,
    stock_quantity: 90,
    reorder_level: 20,
    base_unit: "Tablet",
    expiry_date: getFutureDate(60),
    batch_number: "B-MULT-NE",
  }, [
    { id: "inv-m15-b1", batch_number: "B-MULT-NE", expiry_date: getFutureDate(60), quantity: 90, cost_price: 1500, selling_price: 2200 },
  ]);

  // 16. Gaviscon Liquid (Antacid) - Healthy stock, long expiry
  await addMed({
    id: "m16",
    name: "Gaviscon Double Action",
    generic_name: "Sodium Alginate + Calcium Carbonate",
    brand_name: "Reckitt",
    category_id: "Antacids",
    manufacturer: "Reckitt Benckiser",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-4545",
    dosage_form: "Suspension",
    strength: "150ml",
    cost_price: 2200,
    selling_price: 3200,
    stock_quantity: 45,
    reorder_level: 10,
    base_unit: "Bottle",
    expiry_date: getFutureDate(350),
    batch_number: "B-GAVI-01",
  }, [
    { id: "inv-m16-b1", batch_number: "B-GAVI-01", expiry_date: getFutureDate(350), quantity: 45, cost_price: 2200, selling_price: 3200 },
  ]);

  // 17. Diazepam 5mg (Analgesic/Sedative) - Healthy stock, prescription required, controlled substance
  await addMed({
    id: "m17",
    name: "Diazepam 5mg",
    generic_name: "Diazepam",
    brand_name: "Roche",
    category_id: "Analgesics",
    manufacturer: "Roche",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-8989",
    dosage_form: "Tablet",
    strength: "5mg",
    cost_price: 80,
    selling_price: 150,
    stock_quantity: 60,
    reorder_level: 10,
    base_unit: "Tablet",
    requires_prescription: 1,
    is_controlled: 1,
    expiry_date: getFutureDate(750),
    batch_number: "B-DIAZ-01",
  }, [
    { id: "inv-m17-b1", batch_number: "B-DIAZ-01", expiry_date: getFutureDate(750), quantity: 60, cost_price: 80, selling_price: 150 },
  ]);

  // 18. Cetirizine 10mg (Analgesic/Allergy) - Zero stock, long expiry
  await addMed({
    id: "m18",
    name: "Cetirizine 10mg",
    generic_name: "Cetirizine Hydrochloride",
    brand_name: "Sandoz",
    category_id: "Analgesics",
    manufacturer: "Sandoz",
    supplier_id: "Emzor Pharmaceuticals",
    nafdac_number: "04-6767",
    dosage_form: "Tablet",
    strength: "10mg",
    cost_price: 30,
    selling_price: 50,
    stock_quantity: 0,
    reorder_level: 15,
    base_unit: "Tablet",
    expiry_date: getFutureDate(400),
    batch_number: "B-CETI-00",
  }, [
    { id: "inv-m18-b1", batch_number: "B-CETI-00", expiry_date: getFutureDate(400), quantity: 0, cost_price: 30, selling_price: 50 },
  ]);

  // 19. Azithromycin 500mg (Antibiotic) - Low stock & expiring soon
  await addMed({
    id: "m19",
    name: "Azithromycin 500mg",
    generic_name: "Azithromycin Dihydrate",
    brand_name: "Zithromax",
    category_id: "Antibiotics",
    manufacturer: "Pfizer",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-0303",
    dosage_form: "Tablet",
    strength: "500mg",
    cost_price: 1800,
    selling_price: 2500,
    stock_quantity: 2,
    reorder_level: 10,
    base_unit: "Tablet",
    expiry_date: getFutureDate(30),
    batch_number: "B-AZIT-NE",
  }, [
    { id: "inv-m19-b1", batch_number: "B-AZIT-NE", expiry_date: getFutureDate(30), quantity: 2, cost_price: 1800, selling_price: 2500 },
  ]);

  // 20. Lonart DS (Antimalarial) - Healthy stock, long expiry
  await addMed({
    id: "m20",
    name: "Lonart DS",
    generic_name: "Artemether + Lumefantrine",
    brand_name: "Bliss GVS",
    category_id: "Antimalarials",
    manufacturer: "Bliss GVS Pharma",
    supplier_id: "Emzor Pharmaceuticals",
    nafdac_number: "04-5757",
    dosage_form: "Tablet",
    strength: "80/480mg",
    cost_price: 950,
    selling_price: 1400,
    stock_quantity: 140,
    reorder_level: 25,
    base_unit: "Tablet",
    expiry_date: getFutureDate(520),
    batch_number: "B-LONA-01",
  }, [
    { id: "inv-m20-b1", batch_number: "B-LONA-01", expiry_date: getFutureDate(520), quantity: 140, cost_price: 950, selling_price: 1400 },
  ]);

  // 21. Salbutamol Inhaler (Analgesic/Asthma) - Healthy stock, long expiry
  await addMed({
    id: "m21",
    name: "Salbutamol Inhaler",
    generic_name: "Salbutamol",
    brand_name: "Ventolin",
    category_id: "Analgesics",
    manufacturer: "GlaxoSmithKline",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-4848",
    dosage_form: "Inhaler",
    strength: "100mcg",
    cost_price: 1500,
    selling_price: 2200,
    stock_quantity: 35,
    reorder_level: 8,
    base_unit: "Device",
    expiry_date: getFutureDate(480),
    batch_number: "B-SALB-01",
  }, [
    { id: "inv-m21-b1", batch_number: "B-SALB-01", expiry_date: getFutureDate(480), quantity: 35, cost_price: 1500, selling_price: 2200 },
  ]);

  // 22. Loperamide 2mg (Antacid/Diarrhea) - Low stock & expired
  await addMed({
    id: "m22",
    name: "Loperamide 2mg",
    generic_name: "Loperamide Hydrochloride",
    brand_name: "Imodium",
    category_id: "Antacids",
    manufacturer: "Janssen-Cilag",
    supplier_id: "GSK Nigeria",
    nafdac_number: "04-9090",
    dosage_form: "Capsule",
    strength: "2mg",
    cost_price: 40,
    selling_price: 60,
    stock_quantity: 3,
    reorder_level: 10,
    base_unit: "Capsule",
    expiry_date: getPastDate(5),
    batch_number: "B-LOPE-EX",
  }, [
    { id: "inv-m22-b1", batch_number: "B-LOPE-EX", expiry_date: getPastDate(5), quantity: 3, cost_price: 40, selling_price: 60 },
  ]);
}

