import React from "react";
import { ChevronLeft, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface SupplierDetailPaneProps {
  selectedSupplier: any;
  formatCurrency: (amount: number) => string;
  formatDate: (dateString: string) => string;
  getRatingStars: (rating: number) => React.ReactNode;
  setIsEditDialogOpen: (isOpen: boolean) => void;
  onBack?: () => void;
}

export function SupplierDetailPane({
  selectedSupplier,
  formatCurrency,
  formatDate,
  getRatingStars,
  setIsEditDialogOpen,
  onBack,
}: SupplierDetailPaneProps) {
  const router = useRouter();

  if (!selectedSupplier) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Search className="w-6 h-6 opacity-50" />
        </div>
        <p className="font-medium text-foreground">No Supplier Selected</p>
        <p className="text-sm mt-1">
          Select a supplier from the directory to view details
        </p>
      </div>
    );
  }

  const hasDebt = selectedSupplier.hasDebt;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                className="md:hidden p-2 -ml-2 -my-2 text-muted-foreground hover:text-foreground shrink-0"
                onClick={onBack}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[18px] font-bold shrink-0">
              {selectedSupplier.name[0]}
            </div>
            <div>
              <h2 className="text-[18px] font-bold leading-tight text-foreground">
                {selectedSupplier.name}
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {selectedSupplier.contactPerson}
              </p>
            </div>
          </div>
          <Badge
            variant={
              selectedSupplier.status === "active" ? "default" : "secondary"
            }
            className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-0"
          >
            {selectedSupplier.status === "active" ? "Active" : "Inactive"}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 mt-4">
          <div className="flex text-amber-500 text-[13px] tracking-widest">
            {getRatingStars(selectedSupplier.rating)}
          </div>
          <span className="text-[13px] font-medium text-muted-foreground">
            {selectedSupplier.rating.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="p-6 flex-1">
        {hasDebt && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[10px] font-bold text-destructive uppercase tracking-wide">
                  Outstanding Debt
                </div>
                <div className="text-[12px] text-destructive/80 mt-0.5">
                  From unpaid purchase orders
                </div>
              </div>
              <div className="text-[15px] font-bold text-destructive">
                {formatCurrency(selectedSupplier.debtAmount)}
              </div>
            </div>
            <Button className="w-full font-semibold bg-primary hover:bg-primary/90 text-primary-foreground">
              Record Payment
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-y-6 gap-x-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
              Email
            </div>
            <div
              className="text-[13.5px] font-medium text-foreground truncate"
              title={selectedSupplier.email || "N/A"}
            >
              {selectedSupplier.email || "N/A"}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
              Phone
            </div>
            <div className="text-[13.5px] font-medium text-foreground truncate">
              {selectedSupplier.phone || "N/A"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
              Total Orders
            </div>
            <div className="text-[13.5px] text-foreground font-semibold">
              {selectedSupplier.totalOrders}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
              Total Value
            </div>
            <div className="text-[13.5px] text-foreground font-semibold">
              {formatCurrency(selectedSupplier.totalValue)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
              Last Order
            </div>
            <div className="text-[13.5px] text-foreground font-semibold">
              {formatDate(selectedSupplier.lastOrderDate)}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-border mt-auto grid grid-cols-2 gap-3 shrink-0">
        <Button
          variant="outline"
          className="w-full font-semibold border-border"
          onClick={() => setIsEditDialogOpen(true)}
        >
          Edit Details
        </Button>
        <Button
          className="w-full font-semibold"
          onClick={() =>
            router.push(`/procurement/new?supplierId=${selectedSupplier.id}`)
          }
        >
          New Order
        </Button>
      </div>
    </div>
  );
}
