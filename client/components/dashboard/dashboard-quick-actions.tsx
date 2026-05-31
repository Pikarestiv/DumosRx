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
  onCloseRegister?: () => void;
}

export function DashboardQuickActions({
  storeTerm,
  productTerm,
  onCloseRegister
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
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/inventory?action=add"
            className="p-4 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-primary/20"
          >
            <Package className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">Add {productTerm}</span>
          </Link>
          <Link
            href="/pos"
            className="p-4 bg-emerald-500/10 text-emerald-600 rounded-lg hover:bg-emerald-500/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-emerald-200"
          >
            <ShoppingCart className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">New Sale</span>
          </Link>
          <Link
            href="/inventory"
            className="p-4 bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-amber-200"
          >
            <AlertTriangle className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">Check Expiry</span>
          </Link>
          <Link
            href="/inventory?status=low_stock"
            className="p-4 bg-orange-500/10 text-orange-600 rounded-lg hover:bg-orange-500/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-orange-200"
          >
            <TrendingUp className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">Check Low Stock</span>
          </Link>
          <button
            onClick={() => setIsReportOpen(true)}
            className="p-4 bg-blue-500/10 text-blue-600 rounded-lg hover:bg-blue-500/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-blue-200"
          >
            <FileBarChart className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">Generate P&L</span>
          </button>
          <Link
            href="/reports?tab=daily_close"
            className="p-4 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-destructive/20"
          >
            <XCircle className="h-6 w-6 mb-2 cursor-pointer" />
            <span className="text-sm font-medium">Close Register</span>
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
