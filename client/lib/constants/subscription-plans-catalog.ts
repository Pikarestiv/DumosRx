import type { SubscriptionPlansConfig } from "@/lib/types/subscription-plans";

export interface SubscriptionPlanCatalogEntry {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  numericPrice: number;
  popular: boolean;
}

export function getSubscriptionPlans(
  config: SubscriptionPlansConfig | null,
  isYearly: boolean,
  formatPrice: (price: number) => string,
): SubscriptionPlanCatalogEntry[] {
  const tiers = config?.tiers ?? {};

  const priceFor = (tierKey: string) => {
    const tier = tiers[tierKey];
    const price = isYearly ? tier?.price_yearly : tier?.price_monthly;
    return price ?? 0;
  };

  const limitLabel = (tierKey: string, limitKey: string, singular: string, fallback: number) => {
    const value = tiers[tierKey]?.limits?.[limitKey];
    if (value === -1) return `Unlimited ${singular}`;
    return `Up to ${value ?? fallback} ${singular}`;
  };

  return [
    {
      id: "free",
      name: "Free",
      price: "₦0",
      period: "/ month",
      description: "Standalone retail / POS for single devices.",
      features: [
        limitLabel("free", "stores", "Connected Devices", 1),
        limitLabel("free", "staff", "Staff Account", 1),
        "Local Database Only",
      ],
      numericPrice: 0,
      popular: false,
    },
    {
      id: "starter",
      name: "Starter",
      price: priceFor("starter") === 0 ? "₦3,000" : formatPrice(priceFor("starter")),
      period: isYearly ? "/ year" : "/ month",
      description: "Cloud-connected for growing single stores.",
      features: [
        limitLabel("starter", "stores", "Connected Devices", 1),
        limitLabel("starter", "staff", "Staff Accounts", 3),
        "Cloud Sync (Every 6 Hours)",
        "Prescriptions, Procurement & Expenses",
      ],
      numericPrice: priceFor("starter") || 3000,
      popular: false,
    },
    {
      id: "pro",
      name: "Pro",
      price: priceFor("pro") === 0 ? "₦8,000" : formatPrice(priceFor("pro")),
      period: isYearly ? "/ year" : "/ month",
      description: "Full-featured for multi-store operations.",
      features: [
        limitLabel("pro", "stores", "Connected Devices", 5),
        limitLabel("pro", "staff", "Staff Accounts", 10),
        "Real-Time Cloud Sync",
        "Mobile App Companion",
      ],
      numericPrice: priceFor("pro") || 8000,
      popular: true,
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: priceFor("enterprise") === 0 ? "₦20,000" : formatPrice(priceFor("enterprise")),
      period: isYearly ? "/ year" : "/ month",
      description: "Custom limits for large pharmacy chains.",
      features: [
        limitLabel("enterprise", "stores", "Connected Devices", -1),
        limitLabel("enterprise", "staff", "Staff Accounts", -1),
        "Priority Support",
        "Custom Branding",
      ],
      numericPrice: priceFor("enterprise") || 20000,
      popular: false,
    },
  ];
}
