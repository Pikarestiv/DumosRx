/**
 * Demo data template: declarative description of what a "Seed Demo Data"
 * run creates for a store flagged `is_demo`.
 *
 * Modeled on the real test@dumosrx.com demo account (see
 * refs/dumomvte_dumosrx_db.sql), but kept as data (not a frozen SQL dump) so
 * it's replayed through the app's real create functions in lib/demo/loader.ts.
 * When a schema/field changes, fix it once in the loader/create-functions and
 * this template keeps working, which is the whole point of not just
 * replaying the dump.
 *
 * All dates are expressed as day offsets from "now" (the moment the seed
 * runs), not fixed calendar dates, so the demo always looks current and the
 * expiry-alert states (urgent/close/healthy/long-dated/already-expired)
 * stay correct no matter when it's run.
 */

export const DEMO_CATEGORIES = [
  "Analgesics",
  "Antimalarials",
  "Antibiotics",
  "Antihistamines",
  "Antihypertensives",
  "Antidiabetics",
  "Vitamins & Supplements",
  "Cough & Cold",
  "Antacids",
  "Antiseptics",
] as const;

export const DEMO_SUPPLIER = {
  name: "Fidson Distributors Ltd",
  contact_person: "Amaka Okafor",
  email: "orders@fidsondist.example.com",
  phone: "+234 803 555 0142",
  address: "14 Oshodi–Apapa Expressway, Lagos",
  tax_id: "2109-4477-0001",
  payment_terms: 30,
  is_active: true,
};

export interface DemoProduct {
  /** Stable key used to cross-reference this product from POs/sales below; not persisted. */
  ref: string;
  name: string;
  category: (typeof DEMO_CATEGORIES)[number];
  generic_name?: string;
  manufacturer?: string;
  nafdac_number?: string;
  dosage_form?: string;
  strength?: string;
  selling_price: number;
  reorder_level: number;
  base_unit: string;
  bulk_unit: string;
  units_per_bulk: number;
  requires_prescription?: 0 | 1;
  is_controlled?: 0 | 1;
  /** Cost per base unit when first stocked; drives the receiving batch's cost_price. */
  cost_price: number;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    ref: "panadol_extra",
    name: "Panadol Extra",
    category: "Analgesics",
    generic_name: "Paracetamol + Caffeine",
    manufacturer: "GSK",
    nafdac_number: "04-1122",
    dosage_form: "Caplet",
    strength: "500mg/65mg",
    selling_price: 450,
    reorder_level: 20,
    base_unit: "Card",
    bulk_unit: "Carton",
    units_per_bulk: 100,
    cost_price: 270,
  },
  {
    ref: "coartem",
    name: "Coartem",
    category: "Antimalarials",
    generic_name: "Artemether + Lumefantrine",
    manufacturer: "Novartis",
    nafdac_number: "04-2233",
    dosage_form: "Tablet",
    strength: "20mg/120mg",
    selling_price: 900,
    reorder_level: 15,
    base_unit: "Card",
    bulk_unit: "Carton",
    units_per_bulk: 80,
    cost_price: 550,
  },
  {
    ref: "augmentin_625",
    name: "Augmentin 625mg",
    category: "Antibiotics",
    generic_name: "Amoxicillin + Clavulanate Potassium",
    manufacturer: "GSK",
    nafdac_number: "04-3344",
    dosage_form: "Tablet",
    strength: "625mg",
    selling_price: 2000,
    reorder_level: 15,
    base_unit: "Card",
    bulk_unit: "Carton",
    units_per_bulk: 60,
    requires_prescription: 1,
    cost_price: 1300,
  },
  {
    ref: "flagyl_400",
    name: "Flagyl 400mg",
    category: "Antibiotics",
    generic_name: "Metronidazole",
    manufacturer: "Sanofi",
    nafdac_number: "04-3355",
    dosage_form: "Tablet",
    strength: "400mg",
    selling_price: 350,
    reorder_level: 20,
    base_unit: "Card",
    bulk_unit: "Carton",
    units_per_bulk: 100,
    requires_prescription: 1,
    cost_price: 210,
  },
  {
    ref: "zyrtec",
    name: "Zyrtec",
    category: "Antihistamines",
    generic_name: "Cetirizine",
    manufacturer: "GSK",
    nafdac_number: "04-4455",
    dosage_form: "Tablet",
    strength: "10mg",
    selling_price: 1000,
    reorder_level: 15,
    base_unit: "Card",
    bulk_unit: "Carton",
    units_per_bulk: 60,
    cost_price: 620,
  },
  {
    ref: "loratadine",
    name: "Loratadine (Clarityn)",
    category: "Antihistamines",
    generic_name: "Loratadine",
    manufacturer: "Bayer",
    nafdac_number: "04-4460",
    dosage_form: "Tablet",
    strength: "10mg",
    selling_price: 800,
    reorder_level: 20,
    base_unit: "Card",
    bulk_unit: "Carton",
    units_per_bulk: 100,
    cost_price: 480,
  },
  {
    ref: "norvasc",
    name: "Norvasc",
    category: "Antihypertensives",
    generic_name: "Amlodipine",
    manufacturer: "Pfizer",
    nafdac_number: "04-5566",
    dosage_form: "Tablet",
    strength: "5mg",
    selling_price: 1800,
    reorder_level: 15,
    base_unit: "Card",
    bulk_unit: "Carton",
    units_per_bulk: 60,
    requires_prescription: 1,
    cost_price: 1150,
  },
  {
    ref: "glucophage",
    name: "Glucophage",
    category: "Antidiabetics",
    generic_name: "Metformin",
    manufacturer: "Merck",
    nafdac_number: "04-6677",
    dosage_form: "Tablet",
    strength: "500mg",
    selling_price: 900,
    reorder_level: 15,
    base_unit: "Card",
    bulk_unit: "Carton",
    units_per_bulk: 60,
    requires_prescription: 1,
    cost_price: 560,
  },
  {
    ref: "emzor_vitc",
    name: "Emzor Vitamin C",
    category: "Vitamins & Supplements",
    generic_name: "Ascorbic Acid",
    manufacturer: "Emzor Pharmaceuticals",
    nafdac_number: "04-7788",
    dosage_form: "Tablet",
    strength: "100mg",
    selling_price: 20,
    reorder_level: 150,
    base_unit: "Tablet",
    bulk_unit: "Cup",
    units_per_bulk: 1000,
    cost_price: 11,
  },
  {
    ref: "benylin",
    name: "Benylin",
    category: "Cough & Cold",
    generic_name: "Dextromethorphan",
    manufacturer: "Kenvue (Johnson & Johnson)",
    nafdac_number: "04-8899",
    dosage_form: "Syrup",
    strength: "100ml",
    selling_price: 1800,
    reorder_level: 20,
    base_unit: "Bottle",
    bulk_unit: "Carton",
    units_per_bulk: 24,
    cost_price: 1200,
  },
  {
    ref: "ventolin",
    name: "Ventolin Inhaler",
    category: "Cough & Cold",
    generic_name: "Salbutamol",
    manufacturer: "GSK",
    nafdac_number: "04-8905",
    dosage_form: "Inhaler",
    strength: "100mcg",
    selling_price: 3500,
    reorder_level: 10,
    base_unit: "Piece",
    bulk_unit: "Carton",
    units_per_bulk: 12,
    requires_prescription: 1,
    cost_price: 2400,
  },
  {
    ref: "gaviscon",
    name: "Gaviscon",
    category: "Antacids",
    generic_name: "Alginic Acid + Sodium Bicarbonate",
    manufacturer: "Reckitt Benckiser",
    nafdac_number: "04-9900",
    dosage_form: "Suspension",
    strength: "200ml",
    selling_price: 2500,
    reorder_level: 20,
    base_unit: "Bottle",
    bulk_unit: "Carton",
    units_per_bulk: 24,
    cost_price: 1700,
  },
  {
    ref: "omeprazole",
    name: "Omeprazole",
    category: "Antacids",
    generic_name: "Omeprazole",
    manufacturer: "Various",
    nafdac_number: "04-9910",
    dosage_form: "Capsule",
    strength: "20mg",
    selling_price: 600,
    reorder_level: 20,
    base_unit: "Card",
    bulk_unit: "Carton",
    units_per_bulk: 100,
    cost_price: 360,
  },
  {
    ref: "dettol",
    name: "Dettol Antiseptic",
    category: "Antiseptics",
    manufacturer: "Reckitt Benckiser",
    nafdac_number: "04-1011",
    dosage_form: "Liquid",
    strength: "250ml",
    selling_price: 1200,
    reorder_level: 25,
    base_unit: "Bottle",
    bulk_unit: "Carton",
    units_per_bulk: 12,
    cost_price: 800,
  },
];

/** One row per product in the fully-received seed PO: the batch/expiry
 * spread deliberately covers every expiry-alert state, including one
 * already-expired batch (Gaviscon) kept on purpose so expiry alerts/
 * notifications have something to show immediately after seeding. */
export const DEMO_RECEIVING_PLAN: Record<
  string,
  { expiryOffsetDays: number; batchSuffix: string; bulkQuantity: number }
> = {
  panadol_extra: { expiryOffsetDays: 45, batchSuffix: "PNDX", bulkQuantity: 3 },
  coartem: { expiryOffsetDays: 540, batchSuffix: "CRTM", bulkQuantity: 2 },
  augmentin_625: { expiryOffsetDays: 18, batchSuffix: "AUGM", bulkQuantity: 4 },
  flagyl_400: { expiryOffsetDays: 300, batchSuffix: "FLGL", bulkQuantity: 2 },
  zyrtec: { expiryOffsetDays: 420, batchSuffix: "ZYRT", bulkQuantity: 2 },
  loratadine: { expiryOffsetDays: 250, batchSuffix: "LRTD", bulkQuantity: 2 },
  norvasc: { expiryOffsetDays: 330, batchSuffix: "NRVC", bulkQuantity: 2 },
  glucophage: { expiryOffsetDays: 60, batchSuffix: "GLCP", bulkQuantity: 3 },
  emzor_vitc: { expiryOffsetDays: 600, batchSuffix: "EMVC", bulkQuantity: 2 },
  benylin: { expiryOffsetDays: 210, batchSuffix: "BNLN", bulkQuantity: 2 },
  ventolin: { expiryOffsetDays: 150, batchSuffix: "VNTL", bulkQuantity: 1 },
  gaviscon: { expiryOffsetDays: -10, batchSuffix: "GVSC", bulkQuantity: 1 },
  omeprazole: { expiryOffsetDays: 25, batchSuffix: "OMPZ", bulkQuantity: 2 },
  dettol: { expiryOffsetDays: 900, batchSuffix: "DTTL", bulkQuantity: 2 },
};

export {
  DEMO_CUSTOMERS,
  DEMO_SALES,
  DEMO_EXPENSES,
  DEMO_STAFF,
  DEMO_INFLIGHT_POS,
} from "./template-activity";
export type { DemoCustomer, DemoSaleItem, DemoSale, DemoExpense } from "./template-activity";
