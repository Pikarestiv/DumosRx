"use client";

import Link from "next/link";
import {
  ShoppingCart,
  ClipboardCheck,
  BarChart3,
  Barcode,
  PackagePlus,
  AlertTriangle,
  LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/context/auth-context";

interface QuickAction {
  label: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
  /** Only shown to roles with stock-management access (admin/manager/specialist/store_owner). */
  adminOnly?: boolean;
}

const quickActionsConfig: QuickAction[] = [
  {
    label: "New Sale",
    icon: ShoppingCart,
    href: "/pos",
  },
  {
    label: "Add Stock",
    icon: PackagePlus,
    href: "/procurement/new",
    adminOnly: true,
  },
  {
    label: "Close Register",
    icon: ClipboardCheck,
    href: "/reports?tab=daily_close",
  },
  {
    label: "Scan Barcode",
    icon: Barcode,
    href: "/pos?action=scan",
  },
  {
    label: "View Reports",
    icon: BarChart3,
    href: "/reports",
    adminOnly: true,
  },
  {
    label: "Reorder Stock",
    icon: AlertTriangle,
    href: "/procurement",
    adminOnly: true,
  },
];

function QuickActionCard({ action }: { action: QuickAction }) {
  const content = (
    <>
      <div className="p-3 rounded-2xl sm:rounded-xl w-16 h-16 sm:w-auto sm:h-auto border border-primary/20 sm:border-none bg-background sm:bg-primary/10 shadow-sm sm:shadow-none text-primary group-hover:bg-primary/15 transition-transform flex items-center justify-center">
        <action.icon className="h-5 w-5 sm:h-4 sm:w-4" />
      </div>
      <span className="text-xs sm:text-sm font-medium sm:font-semibold text-foreground mt-1">
        {action.label}
      </span>
    </>
  );

  const className =
    "shrink-0 snap-start w-[94px] sm:w-auto p-1 sm:p-4 bg-transparent sm:bg-card border-none sm:border-solid sm:border sm:border-border rounded-xl transition-all flex flex-col items-center sm:items-start cursor-pointer group outline-none text-center sm:text-left hover:bg-primary/5 sm:hover:border-primary/50";

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={action.onClick} className={className}>
      {content}
    </button>
  );
}

export function DashboardQuickActions() {
  const { isAdmin, canManageStockBatch } = useAuth();
  const visibleActions = quickActionsConfig.filter(
    (action) => !action.adminOnly || isAdmin || canManageStockBatch,
  );

  return (
    <Card className="h-full p-0 sm:p-5 gap-1 sm:gap-5 flex flex-col border-none shadow-none bg-transparent sm:border-solid sm:border-border sm:shadow-sm sm:bg-card ">
      <CardHeader className="p-0">
        <CardTitle className="p-0 font-serif font-semibold">
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 px-2.5 sm:px-0">
        <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 gap-1 sm:gap-4 pb-0 hide-scrollbar snap-x snap-mandatory -mx-4 sm:mx-0 px-4 sm:px-0">
          {visibleActions.map((action, i) => (
            <QuickActionCard key={i} action={action} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
