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
}


const PAYMENTS_FAQ: StorefrontFaq = {
  q: "What payment methods are supported?",
  a: "Depending on the store, you can pay online (where the store offers it), by transfer or mobile money using the details shown at checkout, or when you collect your order.",
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
      a: "Once you place your order online, our dispensary prepares your items immediately. The team may contact you on the phone number you gave to confirm it, and you can collect it at your selected branch.",
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
};

const RETAIL_COPY: StorefrontCopy = {
  faqSubtitle: "Everything you need to know about ordering, pickup, payments, and returns.",
  faqs: [
    {
      q: "How does in-store pickup work?",
      a: "Once you place your order online, the store prepares your items. The store may contact you on the phone number you gave to confirm it, and you can collect it at your selected branch.",
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
};

export function isPharmacyStore(store?: Pick<StorefrontStore, "store_type"> | null): boolean {
  return (store?.store_type ?? "pharmacy") === "pharmacy";
}

export function storefrontCopy(store?: Pick<StorefrontStore, "store_type"> | null): StorefrontCopy {
  return isPharmacyStore(store) ? PHARMACY_COPY : RETAIL_COPY;
}
