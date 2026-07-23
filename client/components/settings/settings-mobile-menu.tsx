import Link from "next/link";
import {
  Store,
  Bell,
  Shield,
  Database,
  Palette,
  Globe,
  Users,
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
}

const MENU_ITEMS: MenuItem[] = [
  {
    href: "/settings/appearance",
    icon: Palette,
    title: "General",
    description: "Theme & Display settings",
  },
  {
    href: "/settings/store",
    icon: Store,
    title: "Store Profile",
    description: "Business details & receipts",
    adminOnly: true,
  },
  {
    href: "/settings/notifications",
    icon: Bell,
    title: "Alerts",
    description: "Stock & expiry warnings",
  },
  {
    href: "/settings/data",
    icon: Database,
    title: "Data & Sync",
    description: "Cloud backup & resets",
    adminOnly: true,
  },
  {
    href: "/settings/security",
    icon: Shield,
    title: "Security",
    description: "PIN & access control",
  },
  {
    href: "/settings/staff",
    icon: Users,
    title: "Staff",
    description: "Manage store personnel",
    adminOnly: true,
  },
  {
    href: "/settings/system",
    icon: Globe,
    title: "System",
    description: "App information & logs",
    adminOnly: true,
  },
];

export function SettingsMobileMenu({ isAdmin }: SettingsMobileMenuProps) {
  return (
    <div className="flex flex-col gap-3 max-w-md mx-auto">
      {MENU_ITEMS.map((item) => {
        if (item.adminOnly && !isAdmin) return null;

        return (
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
              <span className="text-xs text-muted-foreground">
                {item.description}
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/50 shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}
