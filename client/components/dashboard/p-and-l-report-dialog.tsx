"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  FileBarChart, 
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  Info
} from "lucide-react";
import { exportPLReportToPDF } from "@/lib/utils/pdf-export";
import { useStore } from "@/lib/context/store-context";
import { toast } from "sonner";

interface PandLReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PandLReportDialog({ isOpen, onClose }: PandLReportDialogProps) {
  const { profile } = useStore();
  const [loading, setLoading] = useState(false);

  // Mock data for now - in production this would come from SQL queries
  const reportData = {
    period: "April 2026",
    revenue: 1450000,
    cogs: 820000,
    expenses: 150000,
    netProfit: 480000,
    expenseBreakdown: [
      { category: "Rent", amount: 80000 },
      { category: "Electricity", amount: 25000 },
      { category: "Salaries", amount: 45000 }
    ]
  };

  const handleExport = () => {
    try {
      setLoading(true);
      exportPLReportToPDF(reportData, profile?.name || "DumosRx Store");
      toast.success("P&L Report exported successfully");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to export report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-accent/10">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <FileBarChart className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-serif">P&L Dashboard Export</DialogTitle>
              <DialogDescription>
                Generate a professional financial summary for your store.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-6 space-y-6">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-accent/5">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <span className="font-bold">{reportData.period}</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-bold">
              <TrendingUp className="w-3 h-3" />
              +12.5%
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-accent/10 space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Revenue</p>
              <p className="font-bold text-lg">NGN {reportData.revenue.toLocaleString()}</p>
            </div>
            <div className="p-4 rounded-xl border border-accent/10 space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Net Profit</p>
              <p className="font-bold text-lg text-emerald-500">NGN {reportData.netProfit.toLocaleString()}</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-600/80 leading-relaxed italic">
              The exported PDF will include a detailed breakdown of COGS, operating expenses, and category-wise spending.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-accent/10 pt-6">
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button 
            onClick={handleExport}
            disabled={loading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
          >
            <Download className="w-4 h-4 mr-2" />
            {loading ? "Generating..." : "Download PDF Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
