import type { PaginatedStorefrontProducts, StorefrontData } from "@/lib/api/storefront-data";
import type { StorefrontProduct } from "@/lib/types/storefront";

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

const DEMO_PRODUCTS: StorefrontProduct[] = DEMO_PRODUCT_NAMES.map((name, index) => ({
  id: `demo-product-${index + 1}`,
  name,
  selling_price: 1500 + index * 750,
  category: { name: index % 2 === 0 ? "Medicines" : "Wellness" },
}));

export const DEMO_STOREFRONT_DATA: StorefrontData = {
  store: {
    id: "demo",
    name: "Demo Pharmacy",
    location: "Demo Location",
    address: "123 Demo Street",
    phone: "08000000000",
    email: "demo@example.com",
    currency: "NGN",
  },
  storefront: {
    id: "demo",
    slug: "demo",
    name: "Demo Pharmacy",
    headline: "Your neighbourhood pharmacy, now online",
    about: "Demo Pharmacy is a placeholder store used for offline and sandbox builds of the storefront.",
    theme: process.env.STOREFRONT_DEMO_THEME,
  },
  products: DEMO_PRODUCTS,
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
