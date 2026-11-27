import type { StorefrontStore } from "@/lib/api/storefront-data";
import { DEFAULT_STOREFRONT_LOCALE } from "@/lib/storefront-i18n";
import type { MessageKey } from "@/lib/storefront-messages-en";
import { paymentFaqAnswer, type PaymentWays } from "@/lib/storefront-payment-ways";

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

const RETURNS_FAQ = RETAIL_COPY.faqs[3];

const BEAUTY_COPY: StorefrontCopy = {
  ...RETAIL_COPY,
  faqSubtitle: "Everything you need to know about ordering, pickup, product care, and returns.",
  faqs: [
    RETAIL_COPY.faqs[0],
    {
      q: "Are your beauty products genuine?",
      a: "Every product is sourced from the brand or its approved distributors. Check the packaging and batch details when you collect, and ask the store if anything looks wrong.",
    },
    {
      q: "Can you help me choose the right shade or product?",
      a: "Yes. Message the store with your skin type or the look you want and the team will suggest products before you order.",
    },
    PAYMENTS_FAQ,
    BRANCHES_FAQ,
    {
      q: "Can I return an opened product?",
      a: "For hygiene reasons opened skincare and makeup usually cannot be returned. Returns of unopened items follow the store's own policy, so contact the store with your order details first.",
    },
  ],
  aboutSubtitle: "Genuine skincare, makeup and beauty essentials, with friendly advice.",
  aboutBody: (name) =>
    `${name} brings genuine skincare, makeup and beauty products to our community. Browse the range online and order for pickup or delivery.`,
};

const HARDWARE_COPY: StorefrontCopy = {
  ...RETAIL_COPY,
  faqSubtitle: "Everything you need to know about ordering, bulk quantities, pickup, and returns.",
  faqs: [
    RETAIL_COPY.faqs[0],
    {
      q: "Can I order in bulk for a building project?",
      a: "Yes. Add the quantities you need, or message the store with your list for a quote. Large orders may need extra time to prepare or arrange transport.",
    },
    {
      q: "Can I buy by length, weight or other measurements?",
      a: "Items are sold in the unit shown on each product, such as metres, bags or pieces. If you need a different cut or size, contact the store before ordering.",
    },
    PAYMENTS_FAQ,
    BRANCHES_FAQ,
    RETURNS_FAQ,
  ],
  aboutSubtitle: "Tools, building materials and hardware for every job.",
  aboutBody: (name) =>
    `${name} supplies tools, building materials and hardware to builders, trades and homeowners in our community. Browse the range online and order for pickup or delivery.`,
};

const COPY_BY_TYPE = new Map<string, StorefrontCopy>([
  ["pharmacy", PHARMACY_COPY],
  ["beauty", BEAUTY_COPY],
  ["hardware", HARDWARE_COPY],
]);

const TAGLINE_BY_TYPE = new Map<string, MessageKey>([
  ["pharmacy", "tagline.pharmacy"],
  ["beauty", "tagline.beauty"],
  ["hardware", "tagline.hardware"],
]);

type StoreTypeHolder = Pick<StorefrontStore, "store_type"> | null | undefined;

export function isPharmacyStore(store?: StoreTypeHolder): boolean {
  return store?.store_type === "pharmacy";
}

export function storefrontCopy(store?: StoreTypeHolder, paymentWays?: PaymentWays): StorefrontCopy {
  const copy = COPY_BY_TYPE.get(store?.store_type ?? "") ?? RETAIL_COPY;
  if (!paymentWays) return copy;
  const answer = paymentFaqAnswer(DEFAULT_STOREFRONT_LOCALE, paymentWays);
  return { ...copy, faqs: copy.faqs.map((faq) => (faq === PAYMENTS_FAQ ? { ...faq, a: answer } : faq)) };
}

export function storefrontTaglineKey(store?: StoreTypeHolder): MessageKey {
  return TAGLINE_BY_TYPE.get(store?.store_type ?? "") ?? "tagline.retail";
}
