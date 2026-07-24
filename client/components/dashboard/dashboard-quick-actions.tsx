"use client";

import Link from "next/link";
import {
  Package,
  ShoppingCart,
  ClipboardCheck,
  FileBarChart,
  BarChart3,
  Barcode,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { PandLReportDialog } from "./p-and-l-report-dialog";

interface DashboardQuickActionsProps {
  productTerm: string;
}

const getQuickActionsConfig = (
  productTerm: string,
  setIsReportOpen: (val: boolean) => void,
) => [
  {
    label: "New Sale",
    icon: ShoppingCart,
    href: "/pos",
  },
  {
    label: `Add ${productTerm}`,
    icon: Package,
    href: "/inventory/catalog?action=add",
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
  },
  {
    label: "Generate P&L",
    icon: FileBarChart,
    onClick: () => setIsReportOpen(true),
  },
];

function QuickActionCard({ action }: { action: any }) {
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

export function DashboardQuickActions({
  productTerm,
}: DashboardQuickActionsProps) {
  const [isReportOpen, setIsReportOpen] = useState(false);

  return (
    <Card className="h-full p-0 sm:p-5 gap-1 sm:gap-5 flex flex-col border-none shadow-none bg-transparent sm:border-solid sm:border-border sm:shadow-sm sm:bg-card ">
      <CardHeader className="p-0">
        <CardTitle className="p-0 font-serif font-semibold">
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 px-2.5 sm:px-0">
        <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 gap-1 sm:gap-4 pb-0 hide-scrollbar snap-x snap-mandatory -mx-4 sm:mx-0 px-4 sm:px-0">
          {getQuickActionsConfig(productTerm, setIsReportOpen).map(
            (action, i) => (
              <QuickActionCard key={i} action={action} />
            ),
          )}
        </div>

        <PandLReportDialog
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
        />
      </CardContent>
    </Card>
  );
}
