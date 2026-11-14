import type { StorefrontStore } from "@/lib/api/storefront-data";

export interface StorefrontFaq {
  q: string;
  a: string;
}

export interface StorefrontPromise {
  title: string;
  body: string;
}

export interface StorefrontCopy {
  faqSubtitle: string;
  faqs: StorefrontFaq[];
  aboutSubtitle: string;
  aboutBody: (name: string) => string;
  aboutClosing: string;
  promises: [StorefrontPromise, StorefrontPromise, StorefrontPromise];
  locationsSubtitle: string;
  trackerProcessing: string;
  trackerItemsHeading: string;
  heroTagline: string;
  orderingSteps: [StorefrontPromise, StorefrontPromise, StorefrontPromise];
}

const PAY_STEP: StorefrontPromise = {
  title: "Pay",
  body: "Pay online, or when you collect, whichever suits you.",
};

const PAYMENTS_FAQ: StorefrontFaq = {
  q: "What payment methods are supported?",
  a: "Depending on your selected branch, we accept secure online card payments via Paystack, direct bank transfers, or payment on pickup (cash/POS at the counter).",
};

const BRANCHES_FAQ: StorefrontFaq = {
  q: "How can I switch branches?",
  a: "You can select your preferred pickup branch using the branch switcher in the header or from the Locations section. Because inventory is live at each store, switching branches will update item availability.",
};

const FAST_FULFILLMENT: StorefrontPromise = {
  title: "Fast Fulfillment",
  body: "In-store pickup readiness within minutes or quick neighborhood delivery.",
};

const PHARMACY_COPY: StorefrontCopy = {
  faqSubtitle: "Everything you need to know about ordering, pickup, and pharmacy policies.",
  faqs: [
    {
      q: "How does in-store pickup work?",
      a: "Once you place your order online, our dispensary prepares your items immediately. You will receive an SMS/WhatsApp or email confirmation when your package is ready for pickup at your selected branch.",
    },
    PAYMENTS_FAQ,
    {
      q: "Can I order prescription-only medications?",
      a: "Prescription medications require a valid doctor's prescription. Please present your physical prescription upon pickup.",
    },
    BRANCHES_FAQ,
    {
      q: "What is your return policy for pharmaceuticals?",
      a: "In accordance with regulatory healthcare guidelines, dispensed medications cannot be returned or refunded once they leave pharmacy custody, except in the case of verified manufacturing recall.",
    },
  ],
  aboutSubtitle:
    "Dedicated to providing genuine healthcare products, professional pharmacy guidance, and seamless customer service.",
  aboutBody: (name) =>
    `${name} is committed to delivering accessible, high-quality pharmaceuticals and wellness essentials to our community. Every product in our catalog is sourced directly from certified manufacturers and accredited distributors.`,
  aboutClosing:
    "Whether you are ordering your daily maintenance prescriptions or over-the-counter family wellness items, our pharmacy team is here to ensure your care is fast, confidential, and safe.",
  promises: [
    { title: "100% Genuine Care", body: "Verified batch testing, strict temperature control, and genuine products." },
    FAST_FULFILLMENT,
    { title: "Expert Consultation", body: "Experienced pharmacists available to guide dosage and regimen adherence." },
  ],
  locationsSubtitle: "Visit our pharmacy locations for physical pickup, prescriptions, and healthcare inquiries.",
  trackerProcessing: "Processing at Pharmacy",
  trackerItemsHeading: "Prescription & Products Ordered",
  heroTagline: "Medicines, wellness and everyday essentials.",
  orderingSteps: [
    { title: "Choose", body: "Add products to your cart. Prescription items need a valid prescription at pickup." },
    PAY_STEP,
    { title: "Collect", body: "Our pharmacy team prepares your order and lets you know when it is ready." },
  ],
};

const RETAIL_COPY: StorefrontCopy = {
  faqSubtitle: "Everything you need to know about ordering, pickup, payments, and returns.",
  faqs: [
    {
      q: "How does in-store pickup work?",
      a: "Once you place your order online, the store prepares your items. You will receive an SMS/WhatsApp or email confirmation when your order is ready for pickup at your selected branch.",
    },
    PAYMENTS_FAQ,
    BRANCHES_FAQ,
    {
      q: "What is your return policy?",
      a: "Returns and refunds follow the store's own policy. Please contact the store with your order details before bringing an item back.",
    },
  ],
  aboutSubtitle: "Quality products, friendly service, and easy ordering online.",
  aboutBody: (name) =>
    `${name} is committed to bringing quality products and great service to our community. Browse the range online and order for pickup or delivery.`,
  aboutClosing: "Have a question about a product or an order? Get in touch and our team will be happy to help.",
  promises: [
    { title: "Genuine Products", body: "Quality products sourced from trusted suppliers." },
    FAST_FULFILLMENT,
    { title: "Friendly Support", body: "Our team is on hand to answer questions about products and orders." },
  ],
  locationsSubtitle: "Visit our branches for pickup and in-store enquiries.",
  trackerProcessing: "Processing at Store",
  trackerItemsHeading: "Products Ordered",
  heroTagline: "Everything you need, ready for pickup.",
  orderingSteps: [
    { title: "Choose", body: "Add items to your cart. The stock shown is the store's own, kept up to date." },
    PAY_STEP,
    { title: "Collect", body: "You get a message as soon as your order is ready at the counter." },
  ],
};

export function isPharmacyStore(store?: Pick<StorefrontStore, "store_type"> | null): boolean {
  return (store?.store_type ?? "pharmacy") === "pharmacy";
}

export function storefrontCopy(store?: Pick<StorefrontStore, "store_type"> | null): StorefrontCopy {
  return isPharmacyStore(store) ? PHARMACY_COPY : RETAIL_COPY;
}

const STORE_TYPE_LABELS: ReadonlyMap<string, string> = new Map([
  ["pharmacy", "Pharmacy"],
  ["retail", "Retail store"],
]);

export function storeTypeLabel(store?: Pick<StorefrontStore, "store_type"> | null): string | null {
  const type = store?.store_type;
  if (!type) return null;
  return STORE_TYPE_LABELS.get(type) ?? type.charAt(0).toUpperCase() + type.slice(1);
}

export const defaultTagline = (storeType?: string | null): string => storefrontCopy({ store_type: storeType }).heroTagline;
