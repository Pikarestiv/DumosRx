import { TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";

interface SettingsTabNavProps {
  isAdmin: boolean;
  isDesktop: boolean;
}

interface NavItem {
  value: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  disabled?: boolean;
  badge?: string;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ value: "appearance", label: "General", icon: Palette }],
  },
  {
    label: "Account",
    items: [
      {
        value: "personal-info",
        label: "Personal Info",
        icon: UserCircle,
        adminOnly: true,
      },
      { value: "security", label: "Security", icon: Shield },
    ],
  },
  {
    label: "Business",
    items: [
      {
        value: "business-info",
        label: "Business Info",
        icon: Building2,
        adminOnly: true,
      },
      { value: "branches", label: "Branches", icon: Landmark, adminOnly: true },
      { value: "staff", label: "Staff", icon: Users, adminOnly: true },
      {
        value: "roles",
        label: "Roles & Permissions",
        icon: KeyRound,
        adminOnly: true,
        disabled: true,
        badge: "Soon",
      },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        value: "payment-methods",
        label: "Payment Methods",
        icon: Wallet,
        adminOnly: true,
      },
      {
        value: "receipt-settings",
        label: "Receipt Settings",
        icon: Receipt,
        adminOnly: true,
      },
      {
        value: "register-configs",
        label: "Register Configs",
        icon: SlidersHorizontal,
        adminOnly: true,
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      {
        value: "product-units",
        label: "Product Units",
        icon: Ruler,
        adminOnly: true,
      },
      { value: "categories", label: "Categories", icon: Tags, adminOnly: true },
    ],
  },
  {
    label: "System",
    items: [
      { value: "notifications", label: "Alerts", icon: Bell },
      { value: "data", label: "Data & Sync", icon: Database, adminOnly: true },
      { value: "billing", label: "Billing", icon: CreditCard, adminOnly: true },
      { value: "system", label: "System", icon: Globe, adminOnly: true },
    ],
  },
];

/** Tab nav only. Pairs with sibling <TabsContent> panels owned by the parent, which switches page content on selection. */
export function SettingsTabNav({ isAdmin, isDesktop }: SettingsTabNavProps) {
  return (
    <TabsList className="hidden md:flex flex-col h-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-0 gap-1 justify-start md:w-full relative">
      {NAV_GROUPS.map((group) => {
        const visibleItems = group.items.filter(
          (item) => isAdmin || !item.adminOnly,
        );
        if (visibleItems.length === 0) return null;

        return (
          <div
            key={group.label ?? "top"}
            className="w-full md:mt-2 first:md:mt-0"
          >
            {group.label && (
              <div className="hidden md:block px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </div>
            )}
            {visibleItems.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                disabled={item.disabled}
                className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <item.icon className="w-4 h-4 mr-2 md:mr-3 shrink-0" />
                <span className="text-sm truncate">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {item.badge}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </div>
        );
      })}
    </TabsList>
  );
}
