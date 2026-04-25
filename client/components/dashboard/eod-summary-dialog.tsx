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
  XCircle,
  ShoppingBag,
  Award,
  CalendarDays
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

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
      <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-accent/10 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <TrendingUp className="w-7 h-7" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-serif">Daily Close Report</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                Performance summary for {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-3xl bg-primary/5 border border-primary/10 space-y-1 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-12 h-12" />
              </div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Total Revenue</p>
              <p className="text-xl font-black text-foreground">
                {formatCurrency(summary.totalSales, currencyCode)}
              </p>
            </div>
            <div className="p-5 rounded-3xl bg-muted/30 border border-accent/5 space-y-1 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-110 transition-transform">
                    <ShoppingBag className="w-12 h-12" />
                </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Transactions</p>
              <p className="text-xl font-black text-foreground">
                {summary.transactionCount}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                <Separator className="flex-1" />
                Payment Breakdown
                <Separator className="flex-1" />
            </h4>
            
            <div className="space-y-2">
                <div className="flex justify-between items-center p-3 rounded-2xl bg-card border border-accent/5 hover:bg-accent/5 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                            <Banknote className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-bold">Cash Payments</span>
                    </div>
                    <span className="font-mono font-bold">{formatCurrency(summary.cashSales, currencyCode)}</span>
                </div>
                
                <div className="flex justify-between items-center p-3 rounded-2xl bg-card border border-accent/5 hover:bg-accent/5 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                            <CreditCard className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-bold">Card & Mobile</span>
                    </div>
                    <span className="font-mono font-bold">{formatCurrency(summary.cardSales, currencyCode)}</span>
                </div>
                
                <div className="flex justify-between items-center p-3 rounded-2xl bg-card border border-accent/5 hover:bg-accent/5 transition-all text-amber-600">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                            <User className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-bold">Credit Sales</span>
                    </div>
                    <span className="font-mono font-bold">{formatCurrency(summary.debtSales, currencyCode)}</span>
                </div>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 relative overflow-hidden">
            <div className="absolute top-2 right-2">
                <Award className="w-8 h-8 text-primary/20" />
            </div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Today's Star Performer</h4>
            <div className="flex justify-between items-end">
              <div className="space-y-0.5">
                <p className="text-lg font-bold">{summary.topStaff.name}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-tighter">Maximum sales volume achieved</p>
              </div>
              <Badge className="bg-primary hover:bg-primary text-primary-foreground font-black py-1 px-3">
                {formatCurrency(summary.topStaff.total, currencyCode)}
              </Badge>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 bg-muted/30 border-t border-accent/10 flex sm:justify-between gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer">
            <XCircle className="h-4 w-4 mr-2" />
            Discard
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer">
            <Printer className="h-4 w-4 mr-2" />
            Print Daily Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
