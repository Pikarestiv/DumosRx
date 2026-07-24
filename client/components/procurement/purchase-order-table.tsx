"use client";

import { useState, useEffect } from "react";
import {
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { ReceivePOModal, type ReceivedItemPayload } from "./receive-po-modal";
import { PurchaseOrderDetails } from "./purchase-order-details";
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

  // Merge full details with the latest row data from the list (so status updates reflect immediately)
  const listOrder = orders.find((o) => o.id === selectedOrderId);
  const selectedPO = fullSelectedPO && listOrder
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
      <PurchaseOrderDetails
        selectedPO={selectedPO}
        isLoadingDetails={isLoadingDetails}
        getStatusBadge={getStatusBadge}
        onSendPO={onSendPO}
        onDeletePO={onDeletePO}
        setIsReceiveModalOpen={setIsReceiveModalOpen}
      />

      <ReceivePOModal
        isOpen={isReceiveModalOpen}
        onClose={() => setIsReceiveModalOpen(false)}
        po={selectedPO}
        onConfirm={onReceivePO}
      />
    </div>
  );
}
