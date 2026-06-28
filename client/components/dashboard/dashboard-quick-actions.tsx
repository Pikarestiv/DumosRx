"use client";

import Link from "next/link";
import { 
  Package, 
  ShoppingCart, 
  AlertTriangle, 
  TrendingUp,
  XCircle,
  FileBarChart
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { useState } from "react";
import { PandLReportDialog } from "./p-and-l-report-dialog";

interface DashboardQuickActionsProps {
  storeTerm: string;
  productTerm: string;
}

export function DashboardQuickActions({
  storeTerm,
  productTerm,
}: DashboardQuickActionsProps) {
  const [isReportOpen, setIsReportOpen] = useState(false);

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Quick Actions
        </CardTitle>
        <CardDescription>Common {storeTerm.toLowerCase()} management tasks</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/inventory/products?action=add"
            className="p-3 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-primary/20"
          >
            <Package className="h-5 w-5 mb-1.5" />
            <span className="text-xs font-semibold">Add {productTerm}</span>
          </Link>
          <Link
            href="/pos"
            className="p-3 bg-emerald-500/10 text-emerald-600 rounded-lg hover:bg-emerald-500/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-emerald-200"
          >
            <ShoppingCart className="h-5 w-5 mb-1.5" />
            <span className="text-xs font-semibold">New Sale</span>
          </Link>
          <Link
            href="/inventory/batches"
            className="p-3 bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-amber-200"
          >
            <AlertTriangle className="h-5 w-5 mb-1.5" />
            <span className="text-xs font-semibold">Check Expiry</span>
          </Link>
          <Link
            href="/inventory/products?status=low_stock"
            className="p-3 bg-orange-500/10 text-orange-600 rounded-lg hover:bg-orange-500/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-orange-200"
          >
            <TrendingUp className="h-5 w-5 mb-1.5" />
            <span className="text-xs font-semibold">Check Low Stock</span>
          </Link>
          <button
            onClick={() => setIsReportOpen(true)}
            className="p-3 bg-blue-500/10 text-blue-600 rounded-lg hover:bg-blue-500/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-blue-200"
          >
            <FileBarChart className="h-5 w-5 mb-1.5" />
            <span className="text-xs font-semibold">Generate P&L</span>
          </button>
          <Link
            href="/reports?tab=daily_close"
            className="p-3 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-destructive/20"
          >
            <XCircle className="h-5 w-5 mb-1.5 cursor-pointer" />
            <span className="text-xs font-semibold">Close Register</span>
          </Link>
        </div>

        <PandLReportDialog 
            isOpen={isReportOpen}
            onClose={() => setIsReportOpen(false)}
        />
      </CardContent>
    </Card>
  );
}
