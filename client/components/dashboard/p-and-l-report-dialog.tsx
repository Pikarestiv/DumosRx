"use client";

import { useEffect } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Download,
  Calendar,
  TrendingUp,
  Info,
  Loader2,
  FileBarChart
} from "lucide-react";
import { exportPLReportToPDF } from "@/lib/utils/pdf-export";
import { useStore } from "@/lib/context/store-context";
import { toast } from "sonner";

import { usePnLReport } from "@/lib/hooks/use-finance-data";

interface PandLReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PandLReportDialog({ isOpen, onClose }: PandLReportDialogProps) {
  const { storeProfile } = useStore();
  const { reportData, loading, refetch: fetchRealData } = usePnLReport();


  useEffect(() => {
    if (isOpen) {
      fetchRealData();
    }
  }, [isOpen]);

  const handleExport = () => {
    if (!reportData) return;
    try {
      exportPLReportToPDF(reportData, storeProfile?.name || "DumosRx Store");
      toast.success("P&L Report exported successfully");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to export report");
    }
  };

  return (
    <ResponsiveModal 
      open={isOpen} 
      onOpenChange={onClose} 
      title={
        <span className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <FileBarChart className="w-6 h-6" />
          </span>
          <span className="text-xl font-serif">P&L Dashboard Export</span>
        </span>
      } 
      description={<span className="block mt-2">Generate a professional financial summary for your store.</span>} 
      className="max-w-md bg-background/95 backdrop-blur-xl border-accent/10"
    >

        {!!(!reportData && loading) && (
                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                       <Loader2 className="h-8 w-8 text-primary animate-spin" />
                       <p className="text-sm text-muted-foreground animate-pulse font-medium">Calculating Profit & Loss...</p>
                    </div>
                  )}
          {!!(!(!reportData && loading) && reportData) && (
                              <div className="py-6 space-y-6 animate-in fade-in duration-500">
                                <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-accent/5">
                                  <div className="flex items-center gap-3">
                                    <Calendar className="w-5 h-5 text-muted-foreground" />
                                    <span className="font-bold">{reportData.period}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-bold">
                                    <TrendingUp className="w-3 h-3" />
                                    Live Data
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
                                    The exported PDF will include a detailed breakdown of COGS (₦{reportData.cogs.toLocaleString()}), operating expenses (₦{reportData.expenses.toLocaleString()}), and category-wise spending.
                                  </p>
                                </div>
                              </div>
                            )}
          {!(!(!reportData && loading) && reportData) && (
                              <div className="py-10 text-center text-muted-foreground">
                                 Failed to load report data.
                              </div>
                            )}

        <DialogFooter className="border-t border-accent/10 pt-6">
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button 
            onClick={handleExport}
            disabled={loading || !reportData}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
          >
            <Download className="w-4 h-4 mr-2" />
            {!!(loading) && "Generating..."}
                  {!(loading) && "Download PDF Report"}
          </Button>
        </DialogFooter>
      </ResponsiveModal>
  );
}
