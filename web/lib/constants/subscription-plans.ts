export const getSubscriptionPlans = (config: any, isYearly: boolean, formatPrice: (price: number) => string) => {
  return [
    {
      id: "free",
      name: "Free",
      price: "₦0",
      period: "/ month",
      description: "Standalone retail / POS for single devices.",
      features: [
        "Full POS & Inventory (Single Device)",
        "Max 1 User (Owner Only)",
        "Local Database Only",
        "EOD Reports & Stock/Expiry Alerts",
      ],
      missing: [
        "No Cloud Sync & Backups",
        "No Mobile App & Web Dashboard",
        "Locked to Dumos Blue & Light Mode",
        "Premium Tabs Grayed Out",
      ],
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
        "Desktop Host + 2 Cashier Clients",
        "Up to 3 Staff Accounts",
        "Cloud Sync (Every 6 Hours)",
        "Restricted Web Dashboard",
        "Prescriptions, Procurement & Expenses",
      ],
      missing: [
        "No Mobile App Companion",
        "No E-commerce Store URL",
        "No Smart POS Suggestions",
      ],
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
        "Desktop + Web + Mobile Companion App",
        "Up to 10 Staff Accounts",
        "Automatic Sync (Every 15-30 Mins)",
        "Daily Auto Backups & Full Web Analytics",
        "Smart POS Suggestions & Custom Receipts",
        "Custom Store E-commerce URL",
      ],
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
        "Unlimited Multi-Device & Terminals",
        "Unlimited Staff Accounts",
        "Real-time Instant Cloud Sync & Backups",
        "Multi-Store HQ Analytics Dashboard",
        "Custom Branding & White-Labeling",
        "Priority SMS/Email Stock & Expiry Alerts",
      ],
      numericPrice: isYearly 
        ? (config?.tiers?.enterprise?.price_yearly || 150000)
        : (config?.tiers?.enterprise?.price_monthly || 15000),
      active: config?.tiers?.enterprise?.active !== false,
      popular: false,
    }
  ].filter(p => p.active);
};
