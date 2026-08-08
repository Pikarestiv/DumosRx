"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Search, CheckCircle2, Clock, ArrowRight, ClipboardList } from "lucide-react";
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

import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { formatCurrency } from "@/lib/utils";
import { ReceivePOModal, type ReceivedItemPayload } from "./receive-po-modal";
import { PurchaseOrderDetails } from "./purchase-order-details";
import { PurchaseOrderStatusFilter } from "./purchase-order-status-filter";
import { getPurchaseOrderById, type PurchaseOrder } from "@/lib/db/procurement";
import { ResponsiveDetailPanel } from "@/components/ui/responsive-detail-panel";

interface PurchaseOrderTableProps {
  orders: PurchaseOrder[];
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

function NoPurchaseOrdersRow() {
  return (
    <TableRow>
      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
        <ClipboardList className="w-6 h-6 mx-auto mb-2 opacity-30" />
        No purchase orders found
      </TableCell>
    </TableRow>
  );
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

  const { data: fullSelectedPO, isLoading: isLoadingDetails } = useQuery({
    ...queryKeys.purchaseOrders.detail(selectedOrderId),
    queryFn: () => getPurchaseOrderById(selectedOrderId as string),
    enabled: !!selectedOrderId,
  });

  useEffect(() => {
    // Close the panel if the selected order is removed from the list from
    // under it (e.g. deleted) rather than leaving it showing stale data.
    if (
      selectedOrderId &&
      orders.length > 0 &&
      !orders.find((o) => o.id === selectedOrderId)
    ) {
      setSelectedOrderId(null);
    }
  }, [orders, selectedOrderId]);

  // Merge full details with the latest row data from the list (so status updates reflect immediately)
  const listOrder = orders.find((o) => o.id === selectedOrderId);
  const selectedPO =
    fullSelectedPO && listOrder
      ? { ...fullSelectedPO, ...listOrder }
      : fullSelectedPO || listOrder || null;

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
    <div className="flex flex-col gap-5 flex-1 min-h-0 overflow-hidden">
      <Card className="py-0 flex-1 flex flex-col gap-0 md:rounded-[14px] border-0 md:border md:border-border bg-transparent md:bg-card shadow-none md:shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
        <div className="p-0 md:p-4 flex flex-col gap-4 border-b-0 md:border-b border-border">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 pointer-events-none" />
            <Input
              placeholder="Search vendor or PO#..."
              className="pl-9 h-10 text-[13px] rounded-[10px] bg-card border-border md:bg-muted md:border-transparent"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <PurchaseOrderStatusFilter
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
        </div>

        <div className="flex-1 overflow-auto">
          {isFuzzyFallback && orders.length > 0 && (
            <div className="px-5 pt-2 pb-2">
              <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-[13px] border border-amber-500/20 text-center font-medium rounded-md mb-2">
                Did you mean? (No exact matches found. Showing closest names.)
              </div>
            </div>
          )}
          {/* Mobile: card list */}
          <div className="md:hidden flex flex-col gap-2 px-0 py-3 md:px-3 md:p-3">
            {loading && (
              <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
                <Clock className="w-6 h-6 animate-spin mb-2 opacity-50" />
                Loading orders...
              </div>
            )}
            {!loading && orders.length === 0 && (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-[13px]">
                No purchase orders found
              </div>
            )}
            {!loading &&
              orders.length > 0 &&
              orders.map((po) => (
                <div
                  key={po.id}
                  onClick={() => setSelectedOrderId(po.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedOrderId === po.id ? "bg-primary/10 border-primary/30" : "bg-card hover:bg-primary/5"}`}
                >
                  <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px]">
                    PO
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold truncate">
                      {po.vendor_name || "Unknown Vendor"}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground truncate">
                      PO-{po.id.split("-")[0].toUpperCase()} &middot;{" "}
                      {formatDateToDDMMYYYY(po.created_at)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[13.5px] font-bold text-foreground whitespace-nowrap">
                      {formatCurrency(po.total_amount)}
                    </span>
                    {getStatusBadge(po.status)}
                  </div>
                </div>
              ))}
          </div>

          {/* Desktop: table */}
          <Table className="hidden md:table">
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
              {!loading && orders.length === 0 && <NoPurchaseOrdersRow />}
              {!loading &&
                orders.length > 0 &&
                orders.map((po) => (
                  <TableRow
                    key={po.id}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${selectedOrderId === po.id ? "bg-primary/5 hover:bg-primary/5" : "hover:bg-accent/50"}`}
                    onClick={() => setSelectedOrderId(po.id)}
                  >
                    <TableCell className="font-mono pl-4 text-xs font-semibold text-foreground py-2.5">
                      PO-{po.id.split("-")[0].toUpperCase()}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <span className="text-[13px] font-medium text-foreground">
                        {po.vendor_name || "Unknown Vendor"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[12px] font-medium py-2.5">
                      {formatDateToDDMMYYYY(po.created_at)}
                    </TableCell>
                    <TableCell className="font-bold text-[13px] text-foreground py-2.5">
                      {formatCurrency(po.total_amount)}
                    </TableCell>
                    <TableCell className="py-2.5">
                      {getStatusBadge(po.status)}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ResponsiveDetailPanel
        open={!!selectedOrderId}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
      >
        <PurchaseOrderDetails
          selectedPO={selectedPO}
          isLoadingDetails={isLoadingDetails}
          getStatusBadge={getStatusBadge}
          onSendPO={onSendPO}
          onDeletePO={onDeletePO}
          setIsReceiveModalOpen={setIsReceiveModalOpen}
          onClose={() => setSelectedOrderId(null)}
        />
      </ResponsiveDetailPanel>

      <ReceivePOModal
        isOpen={isReceiveModalOpen}
        onClose={() => setIsReceiveModalOpen(false)}
        po={selectedPO}
        onConfirm={onReceivePO}
      />
    </div>
  );
}
