"use client";

import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Banknote, 
  CreditCard, 
  User, 
  TrendingUp, 
  Printer,
  XCircle
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface EODSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: {
    totalSales: number;
    cashSales: number;
    cardSales: number;
    debtSales: number;
    transactionCount: number;
    topStaff: { name: string; total: number };
  };
  currencyCode?: string;
}

export function EODSummaryDialog({
  open,
  onOpenChange,
  summary,
  currencyCode
}: EODSummaryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-black">
            <TrendingUp className="h-6 w-6 text-accent" />
            End of Day Summary
          </DialogTitle>
          <DialogDescription>
            Financial summary for {new Date().toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted/50 rounded-xl border">
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total Revenue</p>
              <p className="text-2xl font-black text-foreground">
                {formatCurrency(summary.totalSales, currencyCode)}
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-xl border">
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Transactions</p>
              <p className="text-2xl font-black text-foreground">
                {summary.transactionCount}
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Breakdown by Method</h4>
            <div className="flex justify-between items-center p-2 hover:bg-muted/30 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 text-green-600 rounded-full">
                  <Banknote className="h-4 w-4" />
                </div>
                <span className="font-medium">Cash Payments</span>
              </div>
              <span className="font-bold">{formatCurrency(summary.cashSales, currencyCode)}</span>
            </div>
            <div className="flex justify-between items-center p-2 hover:bg-muted/30 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-full">
                  <CreditCard className="h-4 w-4" />
                </div>
                <span className="font-medium">Card Payments</span>
              </div>
              <span className="font-bold">{formatCurrency(summary.cardSales, currencyCode)}</span>
            </div>
            <div className="flex justify-between items-center p-2 hover:bg-muted/30 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 text-purple-600 rounded-full">
                  <User className="h-4 w-4" />
                </div>
                <span className="font-medium">Credit/Debt</span>
              </div>
              <span className="font-bold">{formatCurrency(summary.debtSales, currencyCode)}</span>
            </div>
          </div>

          <Separator />

          <div className="p-4 bg-accent/5 rounded-xl border-2 border-accent/20">
            <h4 className="text-sm font-bold uppercase tracking-widest text-accent mb-2">🏆 Star Performer</h4>
            <div className="flex justify-between items-center">
              <span className="font-medium">{summary.topStaff.name}</span>
              <span className="font-black text-accent">{formatCurrency(summary.topStaff.total, currencyCode)} sold</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <XCircle className="h-4 w-4 mr-2" />
            Close
          </Button>
          <Button className="bg-accent hover:bg-accent/90">
            <Printer className="h-4 w-4 mr-2" />
            Print Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
