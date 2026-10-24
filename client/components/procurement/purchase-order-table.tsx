"use client";

import { useState } from "react";
import { AlertTriangle, Search, Clock, ClipboardList } from "lucide-react";
import { useResolvedMediaQuery } from "@/hooks/use-media-query";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ReceivePOPanel, type ReceivedItemPayload } from "./receive-po-panel";
import { PurchaseOrderDetails } from "./purchase-order-details";
import { PurchaseOrderStatusFilter } from "./purchase-order-status-filter";
import { type PurchaseOrder } from "@/lib/db/procurement";
import { ResponsiveDetailPanel } from "@/components/ui/responsive-detail-panel";
import { useSelectedOrder } from "./use-selected-order";
import { useAuth } from "@/lib/context/auth-context";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestItemDialog } from "@/components/pos/request-item-dialog";
import {
  getStatusBadge,
  NoPurchaseOrdersRow,
  PurchaseOrderMobileRow,
  PurchaseOrderRow,
} from "./purchase-order-rows";

interface PurchaseOrderTableProps {
  orders: PurchaseOrder[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Resolves true only once the receive has actually landed, so the panel
   * stays put with its spinner until then and is only dismissed on success. */
  onReceivePO: (
    id: string,
    receivedItems: ReceivedItemPayload[],
  ) => void | Promise<boolean | void>;
  /** True while a receive is in flight, so the panel can lock its
   * "Confirm & Receive" button instead of allowing a second submit. */
  isReceivingPO?: boolean;
  onSendPO: (id: string) => void;
  onDeletePO?: (id: string) => void;
  /** True while a status write (mark-as-sent / delete) is in flight. */
  isMutatingPO?: boolean;
  isFuzzyFallback?: boolean;
  initialSelectedId?: string | null;
  /** The orders query failed, which is not the same thing as there being no
   * orders - both used to render the identical "No purchase orders found". */
  hasLoadError?: boolean;
  onRetryLoad?: () => void;
}

export function PurchaseOrderTable({
  orders,
  loading,
  searchQuery,
  onSearchChange,
  activeTab,
  onTabChange,
  onReceivePO,
  isReceivingPO,
  onSendPO,
  onDeletePO,
  isMutatingPO,
  isFuzzyFallback,
  initialSelectedId,
  hasLoadError,
  onRetryLoad,
}: PurchaseOrderTableProps) {
  const {
    selectedOrderId,
    setSelectedOrderId,
    panelView,
    setPanelView,
    selectedPO,
    isLoadingDetails,
  } = useSelectedOrder(orders, initialSelectedId);
  const { isAdmin, user } = useAuth();
  const isAuditor = user?.role === "auditor";
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const { matches: isDesktopList, resolved: layoutResolved } =
    useResolvedMediaQuery("(min-width: 1024px)");
  const showEmpty = !loading && !hasLoadError && orders.length === 0;
  const showRows = !loading && !hasLoadError && orders.length > 0;

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
          {layoutResolved && !isDesktopList && (
            <div className="flex flex-col gap-2 px-0 py-3">
              {loading && (
                <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
                  <Clock className="w-6 h-6 animate-spin mb-2 opacity-50" />
                  Loading orders...
                </div>
              )}
              {!loading && hasLoadError && (
                <EmptyState
                  icon={AlertTriangle}
                  title="Couldn't load orders"
                  description="Something went wrong reading the order list."
                  action={
                    onRetryLoad
                      ? { label: "Try again", onClick: onRetryLoad }
                      : undefined
                  }
                />
              )}
              {showEmpty && (
                <EmptyState
                  icon={ClipboardList}
                  title="No purchase orders found"
                  action={
                    isAdmin
                      ? { label: "Create Purchase Order", href: "/procurement/new" }
                      : isAuditor
                        ? undefined
                        : {
                            label: "Request Product",
                            onClick: () => setShowRequestDialog(true),
                          }
                  }
                />
              )}
              {showRows &&
                orders.map((po) => (
                  <PurchaseOrderMobileRow
                    key={po.id}
                    order={po}
                    isSelected={selectedOrderId === po.id}
                    onSelect={() => setSelectedOrderId(po.id)}
                  />
                ))}
            </div>
          )}

          {layoutResolved && isDesktopList && (
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
              {!loading && hasLoadError && (
                <TableRow>
                  <TableCell colSpan={5} className="h-32">
                    <EmptyState
                      icon={AlertTriangle}
                      title="Couldn't load orders"
                      description="Something went wrong reading the order list."
                      action={
                        onRetryLoad
                          ? { label: "Try again", onClick: onRetryLoad }
                          : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
              {showEmpty && (
                <NoPurchaseOrdersRow
                  isAdmin={isAdmin}
                  isAuditor={isAuditor}
                  onRequestProduct={() => setShowRequestDialog(true)}
                />
              )}
              {showRows &&
                orders.map((po) => (
                  <PurchaseOrderRow
                    key={po.id}
                    order={po}
                    isSelected={selectedOrderId === po.id}
                    onSelect={() => setSelectedOrderId(po.id)}
                  />
                ))}
            </TableBody>
          </Table>
          )}
        </div>
      </Card>

      <ResponsiveDetailPanel
        open={!!selectedOrderId}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
        widthClassName={
          panelView === "receive"
            ? "w-full sm:w-[90vw] sm:min-w-[560px] sm:max-w-[1500px]"
            : undefined
        }
      >
        {panelView === "receive" ? (
          <ReceivePOPanel
            po={selectedPO}
            isReceiving={isReceivingPO}
            onBack={() => setPanelView("details")}
            onConfirm={(id, receivedItems) => {
              void (async () => {
                const received = await onReceivePO(id, receivedItems);
                if (received !== false) setPanelView("details");
              })();
            }}
          />
        ) : (
          <PurchaseOrderDetails
            selectedPO={selectedPO}
            isLoadingDetails={isLoadingDetails}
            getStatusBadge={getStatusBadge}
            onSendPO={onSendPO}
            onDeletePO={onDeletePO}
            isMutatingPO={isMutatingPO}
            onReceiveGoods={() => setPanelView("receive")}
            onClose={() => setSelectedOrderId(null)}
          />
        )}
      </ResponsiveDetailPanel>

      <RequestItemDialog
        open={showRequestDialog}
        onOpenChange={setShowRequestDialog}
      />
    </div>
  );
}
