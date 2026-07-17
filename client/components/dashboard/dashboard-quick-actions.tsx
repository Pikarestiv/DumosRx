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
        <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-2 sm:pb-0 hide-scrollbar snap-x snap-mandatory -mx-4 sm:mx-0 px-4 sm:px-0">
          <Link
            href="/inventory/products?action=add"
            className="shrink-0 snap-start w-[100px] sm:w-auto p-3 bg-muted/30 border border-border/50 rounded-xl hover:bg-muted hover:border-border transition-colors flex flex-col items-center justify-center text-center cursor-pointer group"
          >
            <div className="p-2.5 bg-primary/10 rounded-lg mb-2 text-primary group-hover:scale-110 transition-transform">
              <Package className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground">Add {productTerm}</span>
          </Link>
          <Link
            href="/pos"
            className="shrink-0 snap-start w-[100px] sm:w-auto p-3 bg-muted/30 border border-border/50 rounded-xl hover:bg-muted hover:border-border transition-colors flex flex-col items-center justify-center text-center cursor-pointer group"
          >
            <div className="p-2.5 bg-primary/10 rounded-lg mb-2 text-primary group-hover:scale-110 transition-transform">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground">New Sale</span>
          </Link>
          <Link
            href="/inventory/batches"
            className="shrink-0 snap-start w-[100px] sm:w-auto p-3 bg-muted/30 border border-border/50 rounded-xl hover:bg-muted hover:border-border transition-colors flex flex-col items-center justify-center text-center cursor-pointer group"
          >
            <div className="p-2.5 bg-primary/10 rounded-lg mb-2 text-primary group-hover:scale-110 transition-transform">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground">Check Expiry</span>
          </Link>
          <Link
            href="/inventory/products?status=low_stock"
            className="shrink-0 snap-start w-[100px] sm:w-auto p-3 bg-muted/30 border border-border/50 rounded-xl hover:bg-muted hover:border-border transition-colors flex flex-col items-center justify-center text-center cursor-pointer group"
          >
            <div className="p-2.5 bg-primary/10 rounded-lg mb-2 text-primary group-hover:scale-110 transition-transform">
              <TrendingUp className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground">Low Stock</span>
          </Link>
          <button
            onClick={() => setIsReportOpen(true)}
            className="shrink-0 snap-start w-[100px] sm:w-auto p-3 bg-muted/30 border border-border/50 rounded-xl hover:bg-muted hover:border-border transition-colors flex flex-col items-center justify-center text-center cursor-pointer group outline-none"
          >
            <div className="p-2.5 bg-primary/10 rounded-lg mb-2 text-primary group-hover:scale-110 transition-transform">
              <FileBarChart className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground">Generate P&L</span>
          </button>
          <Link
            href="/reports?tab=daily_close"
            className="shrink-0 snap-start w-[100px] sm:w-auto p-3 bg-muted/30 border border-border/50 rounded-xl hover:bg-muted hover:border-border transition-colors flex flex-col items-center justify-center text-center cursor-pointer group"
          >
            <div className="p-2.5 bg-destructive/10 rounded-lg mb-2 text-destructive group-hover:scale-110 transition-transform">
              <XCircle className="h-4 w-4 cursor-pointer" />
            </div>
            <span className="text-[11px] font-bold text-foreground">Close Register</span>
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
