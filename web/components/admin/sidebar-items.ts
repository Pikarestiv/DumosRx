import {
  LayoutDashboard,
  Users,
  Store,
  Package,
  MessageSquare,
  Settings,
  Megaphone,
  Download,
  ScrollText,
  Link2,
  type LucideIcon,
} from "lucide-react";

export interface AdminSidebarItem {
  id: string;
  name: string;
  icon: LucideIcon;
  href: string;
  roles?: string[];
}

const SUPER_ADMIN_ONLY = ["super_admin"];

export const sidebarItems: AdminSidebarItem[] = [
  { id: "dashboard", name: "Overview", icon: LayoutDashboard, href: "/admin" },
  {
    id: "stores",
    name: "Stores",
    icon: Store,
    href: "/admin/stores",
  },
  {
    id: "register-store",
    name: "Register Store",
    icon: Store,
    href: "/admin/stores/new",
    roles: ["platform_admin", "agent"],
  },
  {
    id: "my-stores",
    name: "My Stores",
    icon: Store,
    href: "/admin/stores/mine",
    roles: ["platform_admin", "agent"],
  },
  {
    id: "referrals",
    name: "My Referrals",
    icon: Link2,
    href: "/admin/referrals",
    roles: ["super_admin", "platform_admin", "agent"],
  },
  { id: "users", name: "Platform Users", icon: Users, href: "/admin/users" },
  {
    id: "products",
    name: "Global Products",
    icon: Package,
    href: "/admin/products",
  },
  {
    id: "communications",
    name: "Communications",
    icon: MessageSquare,
    href: "/admin/communications",
  },
  {
    id: "marketing",
    name: "Marketing",
    icon: Megaphone,
    href: "/admin/marketing",
  },
  {
    id: "activity",
    name: "Activity Log",
    icon: ScrollText,
    href: "/admin/activity",
  },
  {
    id: "settings",
    name: "Platform Settings",
    icon: Settings,
    href: "/admin/settings",
  },
  {
    id: "downloads",
    name: "System Downloads",
    icon: Download,
    href: "/admin/downloads",
  },
];

export function visibleSidebarItems(role: string | undefined): AdminSidebarItem[] {
  return sidebarItems.filter((item) =>
    (item.roles ?? SUPER_ADMIN_ONLY).includes(role ?? ""),
  );
}
