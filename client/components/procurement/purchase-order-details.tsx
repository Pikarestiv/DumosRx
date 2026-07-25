import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, CheckCircle2, Edit2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PurchaseOrderDetailsProps {
  selectedPO: any;
  isLoadingDetails: boolean;
  getStatusBadge: (status: string) => React.ReactNode;
  onSendPO: (id: string) => void;
  onDeletePO?: (id: string) => void;
  setIsReceiveModalOpen: (isOpen: boolean) => void;
  onClose: () => void;
}

export function PurchaseOrderDetails({
  selectedPO,
  isLoadingDetails,
  getStatusBadge,
  onSendPO,
  onDeletePO,
  setIsReceiveModalOpen,
  onClose,
}: PurchaseOrderDetailsProps) {
  const router = useRouter();

  if (!selectedPO) {
    return (
      <Card className="hidden lg:flex flex-[1] flex-col items-center justify-center rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden text-muted-foreground text-[13.5px] font-medium">
        Select an order to view details
      </Card>
    );
  }

  return (
    // Full-screen takeover on mobile (matches the prescription detail panel
    // pattern), a normal panel alongside the list on desktop.
    <Card className="fixed inset-0 z-50 lg:static lg:z-auto lg:flex-[1] flex flex-col h-full bg-background lg:bg-card lg:rounded-[14px] lg:border lg:border-border shadow-none lg:shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden p-0 gap-0">
      <div className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center gap-3 p-5 pt-[calc(var(--tauri-top,0px)+1.25rem)] lg:pt-5 border-b border-border">
            <div
              className="lg:hidden w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors"
              onClick={onClose}
            >
              <ArrowLeft className="w-[17px] h-[17px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between mb-1 gap-2">
                <h3 className="text-[17px] font-bold text-foreground truncate">
                  PO-{selectedPO.id.split("-")[0].toUpperCase()}
                </h3>
                {getStatusBadge(selectedPO.status)}
              </div>
              <p className="text-[13px] text-muted-foreground font-medium truncate">
                {selectedPO.vendor_name} ·{" "}
                {formatDateToDDMMYYYY(selectedPO.created_at)}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="p-5">
              {isLoadingDetails ? (
                <div className="flex justify-center items-center h-32 text-muted-foreground">
                  <Clock className="w-6 h-6 animate-spin mr-2 opacity-50" />
                  Loading details...
                </div>
              ) : (
                <>
                  {selectedPO.notes && (
                    <div className="bg-muted p-3.5 rounded-lg text-[13px] text-muted-foreground mb-6">
                      {selectedPO.notes}
                    </div>
                  )}

                  <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-3">
                    Line Items
                  </h4>
                  <div className="flex flex-col gap-3">
                    {selectedPO.items && selectedPO.items.length > 0 ? (
                      selectedPO.items.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between text-[13px]"
                        >
                          <span className="font-medium text-foreground leading-tight">
                            {item.product_name || "Unknown Product"}{" "}
                            <span className="text-muted-foreground ml-1">
                              × {item.bulk_quantity}
                            </span>
                          </span>
                          <span className="font-bold shrink-0 ml-4">
                            {formatCurrency(item.subtotal || 0)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[13px] text-muted-foreground italic bg-muted/50 border border-border/50 p-3 rounded-lg text-center">
                        Line items available in full view
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[14px] font-bold mt-4 pt-4 border-t border-border">
                      <span>Total</span>
                      <span>{formatCurrency(selectedPO.total_amount)}</span>
                    </div>
                  </div>

                  <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mt-8 mb-4">
                    Order Status
                  </h4>
                  <div className="flex flex-col gap-4 relative">
                    <div className="absolute left-[9px] top-[14px] bottom-[14px] w-[2px] bg-border z-0"></div>

                    {/* Draft Step */}
                    <div className="flex items-center gap-3 z-10">
                      <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background">
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                      <span className="text-[13.5px] font-semibold text-foreground">
                        Draft
                      </span>
                    </div>

                    {/* Sent Step */}
                    <div className="flex items-center gap-3 z-10">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center border-2 border-background ${selectedPO.status === "sent" || selectedPO.status === "received" ? "bg-primary text-primary-foreground" : "bg-muted border border-border"}`}
                      >
                        {(selectedPO.status === "sent" ||
                          selectedPO.status === "received") && (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                      </div>
                      <span
                        className={`text-[13.5px] font-semibold ${selectedPO.status === "sent" || selectedPO.status === "received" ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        Sent
                      </span>
                    </div>

                    {/* Received Step */}
                    <div className="flex items-center gap-3 z-10">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center border-2 border-background ${selectedPO.status === "received" ? "bg-primary text-primary-foreground" : "bg-muted border border-border"}`}
                      >
                        {selectedPO.status === "received" && (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                      </div>
                      <span
                        className={`text-[13.5px] font-semibold ${selectedPO.status === "received" ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        Received
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="print:hidden p-5 pb-[calc(var(--tauri-bottom,env(safe-area-inset-bottom,0px))+1.25rem)] lg:pb-5 border-t border-border bg-card mt-auto flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1 bg-transparent h-10 text-[13.5px] font-bold"
                onClick={() => window.print()}
              >
                Download PDF
              </Button>
              
              {(selectedPO.status === "pending" || selectedPO.status === "sent") && (
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent h-10 text-[13.5px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => router.push(`/procurement/edit?id=${selectedPO.id}`)}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit Order
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {(selectedPO.status === "pending" || selectedPO.status === "sent") && onDeletePO && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="flex-1 h-10 text-[13.5px] font-bold"
                    >
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Are you absolutely sure?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently
                        delete this purchase order and remove its data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDeletePO(selectedPO.id)}
                        className="!bg-destructive !text-destructive-foreground !hover:bg-destructive/90"
                      >
                        Delete Order
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {selectedPO.status === "pending" && (
                <Button
                  className="flex-1 h-10 text-[13.5px] font-bold"
                  onClick={() => onSendPO(selectedPO.id)}
                >
                  Mark as Sent
                </Button>
              )}

              {selectedPO.status === "sent" && (
                <Button
                  className="flex-1 h-10 text-[13.5px] font-bold"
                  onClick={() => setIsReceiveModalOpen(true)}
                >
                  Receive Goods
                </Button>
              )}

              {selectedPO.status === "received" && (
                <Button
                  className="flex-1 h-10 text-[13.5px] font-bold"
                  disabled
                >
                  Completed
                </Button>
              )}
            </div>
          </div>
      </div>
    </Card>
  );
}
