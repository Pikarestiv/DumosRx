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
            href="/medicines"
            className="p-4 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors flex flex-col items-center justify-center text-center cursor-pointer"
          >
            <Package className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">Add {productTerm}</span>
          </Link>
          <Link
            href="/pos"
            className="p-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex flex-col items-center justify-center text-center cursor-pointer"
          >
            <ShoppingCart className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">New Sale</span>
          </Link>
          <Link
            href="/inventory"
            className="p-4 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors flex flex-col items-center justify-center text-center cursor-pointer"
          >
            <AlertTriangle className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">Check Expiry</span>
          </Link>
          <button
            onClick={() => setIsReportOpen(true)}
            className="p-4 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors flex flex-col items-center justify-center text-center cursor-pointer"
          >
            <FileBarChart className="h-6 w-6 mb-2 text-primary" />
            <span className="text-sm font-medium">Generate P&L</span>
          </button>
          <button
            onClick={onCloseRegister}
            className="p-4 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors flex flex-col items-center justify-center text-center cursor-pointer border border-destructive/20"
          >
            <XCircle className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">Close Register</span>
          </button>
        </div>

        <PandLReportDialog 
            isOpen={isReportOpen}
            onClose={() => setIsReportOpen(false)}
        />
      </CardContent>
    </Card>
  );
}
