import type { PaginatedStorefrontProducts, StorefrontData } from "@/lib/api/storefront-data";
import type { StorefrontProduct } from "@/lib/types/storefront";
import { isPharmacyStore } from "@/lib/storefront-copy";

const DEMO_PRODUCT_NAMES = [
  "Paracetamol 500mg Tablets",
  "Vitamin C 1000mg",
  "ORS Sachets",
  "Ibuprofen 400mg",
  "Hand Sanitizer 500ml",
  "Digital Thermometer",
  "Multivitamin Syrup",
  "Antiseptic Liquid 250ml",
  "Cough Syrup 100ml",
  "Surgical Face Masks (50)",
  "Glucose Test Strips",
  "Zinc Tablets",
];

const DEMO_CATEGORIES = ["Medicines", "Wellness", "Nasal Sprays", "Skin Care Creams", "Serums"];
const DEMO_UNPRICED_INDEX = 4;
const DEMO_LOW_STOCK_INDEX = 2;
const DEMO_OUT_OF_STOCK_INDEX = 6;

const DEMO_PRODUCTS: StorefrontProduct[] = DEMO_PRODUCT_NAMES.map((name, index) => ({
  id: `demo-product-${index + 1}`,
  name,
  selling_price: index === DEMO_UNPRICED_INDEX ? 0 : 1500 + index * 750,
  category: { name: DEMO_CATEGORIES[index % DEMO_CATEGORIES.length] },
  stock_quantity: index === DEMO_OUT_OF_STOCK_INDEX ? 0 : index === DEMO_LOW_STOCK_INDEX ? 3 : 40,
  in_stock: index !== DEMO_OUT_OF_STOCK_INDEX,
}));

const WEEKDAY_HOURS = { open: "08:00", close: "18:00" };

const DEMO_STORE_TYPE = process.env.STOREFRONT_DEMO_STORE_TYPE;
const DEMO_KIND = isPharmacyStore({ store_type: DEMO_STORE_TYPE }) ? "Pharmacy" : "Store";
const DEMO_NAME = `Demo ${DEMO_KIND}`;

export const DEMO_STOREFRONT_DATA: StorefrontData = {
  store: {
    id: "demo",
    name: DEMO_NAME,
    location: "Demo Location",
    address: "123 Demo Street",
    phone: "08000000000",
    email: "demo@example.com",
    currency: "NGN",
    store_type: DEMO_STORE_TYPE,
  },
  storefront: {
    id: "demo",
    slug: "demo",
    name: DEMO_NAME,
    headline: `Your neighbourhood ${DEMO_KIND.toLowerCase()}, now online`,
    about: `${DEMO_NAME} is a placeholder store used for offline and sandbox builds of the storefront.`,
    theme: process.env.STOREFRONT_DEMO_THEME,
    accent: process.env.STOREFRONT_DEMO_ACCENT,
    whatsapp: "+234 800 000 0000",
    pickup_minutes: 20,
    opening_hours: { mon: WEEKDAY_HOURS, tue: WEEKDAY_HOURS, wed: WEEKDAY_HOURS, thu: WEEKDAY_HOURS, fri: WEEKDAY_HOURS, sat: WEEKDAY_HOURS },
  },
  products: DEMO_PRODUCTS,
  product_count: DEMO_PRODUCTS.length,
};

export const DEMO_PAGINATED_PRODUCTS: PaginatedStorefrontProducts = {
  data: DEMO_PRODUCTS,
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: 1,
    from: 1,
    last_page: 1,
    path: "/storefront/demo/products",
    per_page: 50,
    to: DEMO_PRODUCTS.length,
    total: DEMO_PRODUCTS.length,
  },
  categories: [],
  store: { id: "demo", name: "Demo Pharmacy", currency: "NGN" },
};
