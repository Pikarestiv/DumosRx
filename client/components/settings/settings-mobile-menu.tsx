import Link from "next/link";
import {
  Bell,
  Shield,
  Database,
  Palette,
  Globe,
  Users,
  CreditCard,
  UserCircle,
  Building2,
  Landmark,
  Wallet,
  Receipt,
  SlidersHorizontal,
  Ruler,
  Tags,
  KeyRound,
  LucideIcon,
  ChevronRight,
} from "lucide-react";

interface SettingsMobileMenuProps {
  isAdmin?: boolean;
}

interface MenuItem {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  adminOnly?: boolean;
  disabled?: boolean;
  badge?: string;
}

interface MenuGroup {
  label?: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    items: [
      { href: "/settings/appearance", icon: Palette, title: "General", description: "Theme & Display settings" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/settings/personal-info", icon: UserCircle, title: "Personal Info", description: "Profile, sessions & account settings", adminOnly: true },
      { href: "/settings/security", icon: Shield, title: "Security", description: "PIN & access control" },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/settings/business-info", icon: Building2, title: "Business Info", description: "Business details & contact specialist", adminOnly: true },
      { href: "/settings/branches", icon: Landmark, title: "Branches", description: "Manage every store location", adminOnly: true },
      { href: "/settings/staff", icon: Users, title: "Staff", description: "Manage store personnel", adminOnly: true },
      { href: "/settings/roles", icon: KeyRound, title: "Roles & Permissions", description: "Custom staff permissions", adminOnly: true, disabled: true, badge: "Soon" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/settings/payment-methods", icon: Wallet, title: "Payment Methods", description: "Accepted payment options", adminOnly: true },
      { href: "/settings/receipt-settings", icon: Receipt, title: "Receipt Settings", description: "Header, footer & branding", adminOnly: true },
      { href: "/settings/register-configs", icon: SlidersHorizontal, title: "Register Configs", description: "Checkout rules & behavior", adminOnly: true },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/settings/product-units", icon: Ruler, title: "Product Units", description: "Manage selling & pack units", adminOnly: true },
      { href: "/settings/categories", icon: Tags, title: "Categories", description: "Organize your product catalog", adminOnly: true },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/settings/notifications", icon: Bell, title: "Alerts", description: "Stock & expiry warnings" },
      { href: "/settings/data", icon: Database, title: "Data & Sync", description: "Cloud backup & resets", adminOnly: true },
      { href: "/settings/billing", icon: CreditCard, title: "Billing", description: "Plan, payment history & referrals", adminOnly: true },
      { href: "/settings/system", icon: Globe, title: "System", description: "App information & logs", adminOnly: true },
    ],
  },
];

export function SettingsMobileMenu({ isAdmin }: SettingsMobileMenuProps) {
  return (
    <div className="flex flex-col gap-5 max-w-md mx-auto">
      {MENU_GROUPS.map((group) => {
        const visibleItems = group.items.filter((item) => isAdmin || !item.adminOnly);
        if (visibleItems.length === 0) return null;

        return (
          <div key={group.label ?? "top"} className="flex flex-col gap-2">
            {group.label && (
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </div>
            )}
            {visibleItems.map((item) =>
              item.disabled ? (
                <div
                  key={item.href}
                  className="flex items-center gap-4 p-4 bg-card border border-border/50 rounded-2xl opacity-50"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col flex-1">
                    <span className="font-semibold text-[15px]">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </div>
                  {item.badge && (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {item.badge}
                    </span>
                  )}
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-4 p-4 bg-card border border-border/50 rounded-2xl shadow-sm hover:bg-accent/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col flex-1">
                    <span className="font-semibold text-[15px]">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground/50 shrink-0" />
                </Link>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
