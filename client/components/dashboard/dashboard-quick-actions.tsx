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
    href: "/inventory/products?action=add",
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

export function DashboardQuickActions({
  productTerm,
}: DashboardQuickActionsProps) {
  const [isReportOpen, setIsReportOpen] = useState(false);

  return (
    <Card className="border-none shadow-none bg-transparent sm:border-solid sm:border-border sm:shadow-sm sm:bg-card pb-0 !gap-0 sm:gap-6">
      <CardHeader className="px-0 sm:px-6 pb-3 sm:pb-6">
        <CardTitle className="font-serif font-semibold !px-0">
          Quick Actions
        </CardTitle>
        {/* <CardDescription>Common {storeTerm.toLowerCase()} management tasks</CardDescription> */}
      </CardHeader>
      <CardContent className="p-0 sm:px-4 pt-0">
        <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 gap-1 sm:gap-4 pb-0 hide-scrollbar snap-x snap-mandatory -mx-4 sm:mx-0 px-4 sm:px-0">
          {getQuickActionsConfig(productTerm, setIsReportOpen).map(
            (action, i) => {
              const content = (
                <>
                  <div className="p-3 rounded-2xl sm:rounded-xl w-13 h-13 sm:w-auto sm:h-auto border border-primary/20 sm:border-none bg-background sm:bg-primary/10 shadow-sm sm:shadow-none text-primary group-hover:bg-primary/15 transition-transform flex items-center justify-center">
                    <action.icon className="h-4 w-4" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-medium sm:font-semibold text-foreground mt-1">
                    {action.label}
                  </span>
                </>
              );

              const className =
                "shrink-0 snap-start w-16 sm:w-auto p-0 sm:p-4 bg-transparent sm:bg-card border-none sm:border-solid sm:border sm:border-border rounded-xl transition-all flex flex-col items-center sm:items-start cursor-pointer group outline-none text-center sm:text-left hover:bg-primary/5 sm:hover:border-primary/50";

              return action.href ? (
                <Link key={i} href={action.href} className={className}>
                  {content}
                </Link>
              ) : (
                <button key={i} onClick={action.onClick} className={className}>
                  {content}
                </button>
              );
            },
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
