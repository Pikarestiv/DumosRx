"use client";

import { useState, useEffect } from "react";
import {
  Search,
  FileText,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { ReceivePOModal, type ReceivedItemPayload } from "./receive-po-modal";
import { getPurchaseOrderById } from "@/lib/db/procurement";

interface PurchaseOrderTableProps {
  orders: any[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onReceivePO: (id: string, receivedItems: ReceivedItemPayload[]) => void;
  onSendPO: (id: string) => void;
  onDeletePO?: (id: string) => void;
  isFuzzyFallback?: boolean;
}

export function PurchaseOrderTable({
  orders,
  loading,
  searchQuery,
  onSearchChange,
  activeTab,
  onTabChange,
  onReceivePO,
  onSendPO,
  onDeletePO,
  isFuzzyFallback,
}: PurchaseOrderTableProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [fullSelectedPO, setFullSelectedPO] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    if (!selectedOrderId && orders.length > 0) {
      setSelectedOrderId(orders[0].id);
    } else if (
      selectedOrderId &&
      !orders.find((o) => o.id === selectedOrderId)
    ) {
      if (orders.length > 0) {
        setSelectedOrderId(orders[0].id);
      } else {
        setSelectedOrderId(null);
      }
    }
  }, [orders, selectedOrderId]);

  useEffect(() => {
    async function loadDetails() {
      if (!selectedOrderId) {
        setFullSelectedPO(null);
        return;
      }
      setIsLoadingDetails(true);
      try {
        const po = await getPurchaseOrderById(selectedOrderId);
        setFullSelectedPO(po);
      } catch (error) {
        console.error("Failed to load PO details", error);
        setFullSelectedPO(null);
      } finally {
        setIsLoadingDetails(false);
      }
    }
    loadDetails();
  }, [selectedOrderId]);

  // Fallback to basic row data if full details haven't loaded yet
  const selectedPO = fullSelectedPO || orders.find((o) => o.id === selectedOrderId) || null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "received":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Received
          </Badge>
        );
      case "sent":
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20">
            <ArrowRight className="w-3 h-3 mr-1" /> Sent
          </Badge>
        );
      case "pending":
      case "draft":
        return (
          <Badge
            variant="outline"
            className="bg-gray-500/10 text-gray-500 border-gray-500/20"
          >
            <Clock className="w-3 h-3 mr-1" /> Draft
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 flex-1 min-h-0 overflow-hidden">
      {/* Left Column - List */}
      <Card className="print:hidden flex-[2] flex flex-col gap-0 rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
        <div className="p-4 flex flex-col gap-4 border-b border-border">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 pointer-events-none" />
            <Input
              placeholder="Search vendor or PO#..."
              className="pl-9 h-10 text-[13px] rounded-[10px] bg-muted border-transparent"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <Tabs
            value={activeTab}
            onValueChange={onTabChange}
            className="w-full"
            variant="chips"
          >
            <TabsList className="w-full md:w-max justify-start overflow-x-auto hide-scrollbar">
              <TabsTrigger value="all">All Orders</TabsTrigger>
              <TabsTrigger value="pending">Drafts</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
              <TabsTrigger value="received">Received</TabsTrigger>
              <TabsTrigger
                value="missing-expiry"
                className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-600"
              >
                Missing Expiry
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-auto">
          {isFuzzyFallback && orders.length > 0 && (
            <div className="px-5 pt-2 pb-2">
              <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-[13px] border border-amber-500/20 text-center font-medium rounded-md mb-2">
                Did you mean? (No exact matches found. Showing closest names.)
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="w-[110px] pl-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  PO Number
                </TableHead>
                <TableHead className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  Vendor
                </TableHead>
                <TableHead className="w-[100px] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  Date
                </TableHead>
                <TableHead className="w-[120px] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  Amount
                </TableHead>
                <TableHead className="w-[100px] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <Clock className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
                    Loading orders...
                  </TableCell>
                </TableRow>
              )}
              {!loading && orders.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No purchase orders found
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                orders.length > 0 &&
                orders.map((po) => (
                  <TableRow
                    key={po.id}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${selectedOrderId === po.id ? "bg-primary/5 hover:bg-primary/5" : "hover:bg-accent/50"}`}
                    onClick={() => setSelectedOrderId(po.id)}
                  >
                    <TableCell className="font-mono pl-4 text-xs font-semibold text-foreground py-[14px]">
                      PO-{po.id.split("-")[0].toUpperCase()}
                    </TableCell>
                    <TableCell className="py-[14px]">
                      <span className="text-[13px] font-medium text-foreground">
                        {po.vendor_name || "Unknown Vendor"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[12px] font-medium py-[14px]">
                      {formatDateToDDMMYYYY(po.created_at)}
                    </TableCell>
                    <TableCell className="font-bold text-[13px] text-foreground py-[14px]">
                      {formatCurrency(po.total_amount)}
                    </TableCell>
                    <TableCell className="py-[14px]">
                      {getStatusBadge(po.status)}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Right Column - Details */}
      <Card className="flex-[1] flex flex-col rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
        {selectedPO ? (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b border-border">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[17px] font-bold text-foreground">
                  PO-{selectedPO.id.split("-")[0].toUpperCase()}
                </h3>
                {getStatusBadge(selectedPO.status)}
              </div>
              <p className="text-[13px] text-muted-foreground font-medium">
                {selectedPO.vendor_name} ·{" "}
                {formatDateToDDMMYYYY(selectedPO.created_at)}
              </p>
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
                  {/* Since line items might not be fetched in the main query, we show a placeholder or render actual items if available */}
                  {selectedPO.items && selectedPO.items.length > 0 ? (
                    selectedPO.items.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between text-[13px]"
                      >
                        <span className="font-medium text-foreground leading-tight">
                          {item.product_name || "Unknown Product"}{" "}
                          <span className="text-muted-foreground ml-1">
                            × {item.quantity_ordered}
                          </span>
                        </span>
                        <span className="font-bold shrink-0 ml-4">
                          {formatCurrency(item.total_price || 0)}
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

            <div className="print:hidden p-5 border-t border-border bg-card mt-auto flex items-center gap-3">
              <Button
                variant="outline"
                className="flex-1 bg-transparent h-10 text-[13.5px] font-bold"
                onClick={() => window.print()}
              >
                Download PDF
              </Button>
              {selectedPO.status === "pending" && (
                <div className="flex flex-1 gap-2">
                  {onDeletePO && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          className="flex-[0.5] h-10 text-[13.5px] font-bold"
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
                            delete this draft purchase order and remove its
                            data.
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
                  <Button
                    className="flex-1 h-10 text-[13.5px] font-bold"
                    onClick={() => onSendPO(selectedPO.id)}
                  >
                    Mark as Sent
                  </Button>
                </div>
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
        ) : (
          <div className="flex items-center justify-center flex-1 text-muted-foreground text-[13.5px] font-medium bg-muted/20">
            Select an order to view details
          </div>
        )}
      </Card>

      <ReceivePOModal
        isOpen={isReceiveModalOpen}
        onClose={() => setIsReceiveModalOpen(false)}
        po={selectedPO}
        onConfirm={onReceivePO}
      />
    </div>
  );
}
