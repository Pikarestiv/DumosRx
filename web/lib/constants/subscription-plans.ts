import type { SubscriptionConfig } from "@/lib/types/admin";

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  missing: string[];
  numericPrice: number;
  active: boolean;
  popular: boolean;
}

export const getSubscriptionPlans = (
  config: Partial<SubscriptionConfig> | undefined,
  isYearly: boolean,
  formatPrice: (price: number) => string,
): SubscriptionPlan[] => {
  return [
    {
      id: "free",
      name: "Free",
      price: "₦0",
      period: "/ month",
      description: "Standalone retail / POS for single devices.",
      features: [
        `Up to ${config?.tiers?.free?.limits?.stores === -1 ? 'Unlimited' : (config?.tiers?.free?.limits?.stores || 1)} Connected Devices`,
        `Max ${config?.tiers?.free?.limits?.staff === -1 ? 'Unlimited' : (config?.tiers?.free?.limits?.staff || 1)} User`,
        "Local Database Only",
        "EOD Reports & Stock/Expiry Alerts",
      ],
      missing: [
        "No Cloud Sync & Backups",
        !config?.tiers?.free?.features?.mobile_app && !config?.tiers?.free?.features?.web_dashboard ? "No Mobile App & Web Dashboard" : "",
        !config?.tiers?.free?.features?.custom_branding ? "Locked to Dumos Blue & Light Mode" : "",
        "Premium Tabs Grayed Out",
      ].filter(Boolean),
      numericPrice: 0,
      active: true,
      popular: false,
    },
    {
      id: "starter",
      name: "Starter",
      price: isYearly 
        ? (config?.tiers?.starter?.price_yearly ? formatPrice(config.tiers.starter.price_yearly) : "₦30,000")
        : (config?.tiers?.starter?.price_monthly ? formatPrice(config.tiers.starter.price_monthly) : "₦3,000"),
      period: isYearly ? "/ year" : "/ month",
      description: "Cloud-connected for growing single stores.",
      features: [
        `Up to ${config?.tiers?.starter?.limits?.stores === -1 ? 'Unlimited' : (config?.tiers?.starter?.limits?.stores || 1)} Connected Devices`,
        `Up to ${config?.tiers?.starter?.limits?.staff === -1 ? 'Unlimited' : (config?.tiers?.starter?.limits?.staff || 3)} Staff Accounts`,
        "Cloud Sync (Every 6 Hours)",
        config?.tiers?.starter?.features?.web_dashboard ? "Web Dashboard Enabled" : "Restricted Web Dashboard",
        "Prescriptions, Procurement & Expenses",
      ].filter(Boolean),
      missing: [
        !config?.tiers?.starter?.features?.mobile_app ? "No Mobile App Companion" : "",
        !config?.tiers?.starter?.features?.ecommerce ? "No E-commerce Store URL" : "",
        !config?.tiers?.starter?.features?.smart_pos ? "No Smart POS Suggestions" : "",
      ].filter(Boolean),
      numericPrice: isYearly 
        ? (config?.tiers?.starter?.price_yearly || 30000)
        : (config?.tiers?.starter?.price_monthly || 3000),
      active: config?.tiers?.starter?.active !== false,
      popular: false,
    },
    {
      id: "pro",
      name: "Dumos Pro",
      price: isYearly 
        ? (config?.tiers?.pro?.price_yearly ? formatPrice(config.tiers.pro.price_yearly) : "₦80,000")
        : (config?.tiers?.pro?.price_monthly ? formatPrice(config.tiers.pro.price_monthly) : "₦8,000"),
      period: isYearly ? "/ year" : "/ month",
      description: "For active, remote, and mobile-connected stores.",
      features: [
        `Up to ${config?.tiers?.pro?.limits?.stores === -1 ? 'Unlimited' : (config?.tiers?.pro?.limits?.stores || 3)} Connected Devices`,
        `Up to ${config?.tiers?.pro?.limits?.staff === -1 ? 'Unlimited' : (config?.tiers?.pro?.limits?.staff || 10)} Staff Accounts`,
        "Automatic Sync (Every 15-30 Mins)",
        "Daily Auto Backups & Full Web Analytics",
        config?.tiers?.pro?.features?.smart_pos ? "Smart POS Suggestions & Custom Receipts" : "",
        config?.tiers?.pro?.features?.ecommerce ? "Custom Store E-commerce URL" : "",
      ].filter(Boolean),
      missing: [
         !config?.tiers?.pro?.features?.custom_branding ? "No Custom Branding" : ""
      ].filter(Boolean),
      popular: true,
      numericPrice: isYearly 
        ? (config?.tiers?.pro?.price_yearly || 80000)
        : (config?.tiers?.pro?.price_monthly || 8000),
      active: config?.tiers?.pro?.active !== false,
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: isYearly 
        ? (config?.tiers?.enterprise?.price_yearly ? formatPrice(config.tiers.enterprise.price_yearly) : "₦150,000")
        : (config?.tiers?.enterprise?.price_monthly ? formatPrice(config.tiers.enterprise.price_monthly) : "₦15,000"),
      period: isYearly ? "/ year" : "/ month",
      description: "Multi-store chains and corporate networks.",
      features: [
        `${config?.tiers?.enterprise?.limits?.stores === -1 ? 'Unlimited' : (config?.tiers?.enterprise?.limits?.stores || 10)} Multi-Device & Terminals`,
        `${config?.tiers?.enterprise?.limits?.staff === -1 ? 'Unlimited' : (config?.tiers?.enterprise?.limits?.staff || 100)} Staff Accounts`,
        "Real-time Instant Cloud Sync & Backups",
        config?.tiers?.enterprise?.features?.web_dashboard ? "Multi-Store HQ Analytics Dashboard" : "",
        config?.tiers?.enterprise?.features?.custom_branding ? "Custom Branding & White-Labeling" : "",
        "Priority SMS/Email Stock & Expiry Alerts",
      ].filter(Boolean),
      missing: [],
      numericPrice: isYearly 
        ? (config?.tiers?.enterprise?.price_yearly || 150000)
        : (config?.tiers?.enterprise?.price_monthly || 15000),
      active: config?.tiers?.enterprise?.active !== false,
      popular: false,
    }
  ].filter(p => p.active);
};
