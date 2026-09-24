"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, Printer, RotateCcw, Wallet } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/context/auth-context";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTransactionDetails } from "@/lib/db/queries/sales";
import { getCustomerById } from "@/lib/db/queries/customers";
import { useRecordCustomerPaymentMutation } from "@/lib/hooks/use-customer-mutations";
import { useRedeemResellerCommissionMutation } from "@/lib/hooks/use-redeem-reseller-commission-mutation";
import { queryKeys } from "@/lib/query-keys";
import { usePrintReceipt } from "./use-print-receipt";
import { RecordPaymentModal } from "@/components/customers/record-payment-modal";
import { toast } from "sonner";
import type { SaleWithDetails, SaleItemDetail } from "@/lib/types/sale";
import { saleToReceiptTransaction } from "./sale-to-receipt-transaction";
import { TransactionItemsView } from "./transaction-items-view";

interface TransactionDetailsDialogProps {
  sale: SaleWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
  onReturnClick?: (sale: SaleWithDetails) => void;
}

export function TransactionDetailsDialog({
  sale,
  open,
  onOpenChange,
  currencyCode,
  onReturnClick,
}: TransactionDetailsDialogProps) {
  const { isAdmin, user } = useAuth();
  const showProfit = user?.role !== "sales_staff";
  const { print, portal } = usePrintReceipt();
  const queryClient = useQueryClient();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const { data: detailsData } = useQuery({
    ...queryKeys.sales.transactionDetails(sale?.id),
    queryFn: () =>
      open && sale?.id ? getTransactionDetails(sale.id) : Promise.resolve(null),
    enabled: !!(open && sale?.id),
  });
  const { data: paymentCustomer } = useQuery({
    ...queryKeys.customers.byId(sale?.customer_id),
    queryFn: () => getCustomerById(sale?.customer_id ?? ""),
    enabled: showPaymentModal && !!sale?.customer_id,
  });

  const items = detailsData?.items || [];
  const returnsData = detailsData?.returnsData || [];
  const recordPaymentMutation = useRecordCustomerPaymentMutation();
  const redeemMutation = useRedeemResellerCommissionMutation();

  // `sale` is a snapshot the caller captured in its own state (selectedSale
  // etc.) - it's never refetched after a redeem, so without this the dialog
  // would keep showing "Not yet redeemed" (and both action buttons enabled)
  // even though the redeem already succeeded. Reset whenever a different
  // sale is opened so a stale override never leaks onto the next one.
  const [redeemOverride, setRedeemOverride] = useState<Partial<
    SaleWithDetails
  > | null>(null);
  useEffect(() => {
    setRedeemOverride(null);
  }, [sale?.id]);

  if (!sale) return null;

  const effectiveSale = redeemOverride ? { ...sale, ...redeemOverride } : sale;

  const handleRedeemCommission = async (
    claimType: "commission" | "store_claim",
  ) => {
    try {
      const patch = await redeemMutation.mutateAsync({
        saleId: sale.id,
        userId: user?.id,
        claimType,
      });
      setRedeemOverride({
        ...patch,
        reseller_commission_redeemed_by: patch.reseller_commission_redeemed_by ?? undefined,
      });
    } catch (error) {
      console.error("Failed to redeem reseller commission:", error);
    }
  };

  const hasOutstandingBalance =
    (sale.payment_status === "pending" || sale.payment_status === "partial") &&
    !!sale.customer_id;
  const saleRemaining = Math.max(
    0,
    (sale.total_amount ?? sale.total ?? 0) - (sale.amount_paid || 0),
  );

  const handleRecordPayment = async (
    amount: number,
    paymentMethod: string,
    notes: string,
  ) => {
    if (!sale.customer_id) return;
    await recordPaymentMutation.mutateAsync({
      customerId: sale.customer_id,
      amount,
      paymentMethod,
      notes,
    });
    toast.success("Payment recorded successfully");
    // Derives the key from the factory (with a throwaway .slice to drop
    // the trailing activeStoreId/currentUserId resource() appends) rather
    // than duplicating the "customerById" literal, so a rename in
    // query-keys.ts can't silently desync from this call site.
    void queryClient.invalidateQueries({
      queryKey: queryKeys.customers.byId(sale.customer_id).queryKey.slice(0, 2),
    });
    setShowPaymentModal(false);
  };

  const totalRefunded = returnsData?.[0]?.total_refunded || 0;

  const totalCostPrice =
    items?.reduce((acc: number, item: SaleItemDetail) => {
      const cost =
        item.cost_price !== null && item.cost_price !== undefined
          ? item.cost_price
          : item.med_cost_price || 0;
      return acc + cost * item.quantity;
    }, 0) || 0;

  const returnedCostPrice =
    items?.reduce((acc: number, item: SaleItemDetail) => {
      const cost =
        item.cost_price !== null && item.cost_price !== undefined
          ? item.cost_price
          : item.med_cost_price || 0;
      return acc + cost * (item.returned_quantity || 0);
    }, 0) || 0;

  const profit =
    (sale.total_amount ?? sale.total ?? 0) -
    totalRefunded -
    (totalCostPrice - returnedCostPrice);

  const cashierName = sale.cashier_name || sale.user_name || sale.cashier;

  const title = "Transaction Details";
  const description = (
    <>
      <span>Reference: {sale.transaction_number}</span>
      <span className="hidden sm:inline"> • </span>
      <span className="block sm:inline mt-1 sm:mt-0 text-muted-foreground/80 sm:text-muted-foreground">
        {formatDateToDDMMYYYY(sale.created_at || "")}{" "}
        {sale.created_at && new Date(sale.created_at).toLocaleTimeString()}
      </span>
      {cashierName && (
        <>
          <span className="hidden sm:inline"> • </span>
          <span className="block sm:inline mt-1 sm:mt-0 text-muted-foreground/80 sm:text-muted-foreground">
            Sold by {cashierName}
          </span>
        </>
      )}
    </>
  );

  const footer = (
    <div className="flex flex-col sm:flex-row justify-end gap-3">
      {hasOutstandingBalance && (
        <Button
          variant="outline"
          onClick={() => setShowPaymentModal(true)}
          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 w-full sm:w-auto"
        >
          <Wallet className="w-4 h-4 mr-2" />
          Record Payment
        </Button>
      )}
      {isAdmin && onReturnClick && (
        <Button
          variant="outline"
          onClick={() => {
            onOpenChange(false);
            onReturnClick(sale);
          }}
          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200 w-full sm:w-auto"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Recall / Return
        </Button>
      )}
      <DropdownMenu>
        <div className="flex w-full sm:w-auto">
          <Button
            onClick={() => print(saleToReceiptTransaction(sale, items), "receipt")}
            className="flex-1 sm:w-auto rounded-r-none"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Receipt
          </Button>
          <DropdownMenuTrigger asChild>
            <Button className="rounded-l-none border-l border-primary-foreground/20 px-2">
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
        </div>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => print(saleToReceiptTransaction(sale, items), "tax")}
          >
            Print Tax Invoice
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const content = (
    <div className="flex flex-col flex-1 min-h-0">
      <ScrollFade containerClassName="flex-1" className="px-4 sm:px-6 pb-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-2 p-3 sm:p-4 bg-muted/30 rounded-lg">
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Customer</p>
            <p className="font-medium text-sm sm:text-base">
              {sale.customer_name || "Walk-in"}
            </p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Payment Method
            </p>
            <p className="font-medium capitalize text-sm sm:text-base">
              {sale.payment_method}
            </p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Total Sale
            </p>
            <p className="font-medium text-base sm:text-lg text-primary">
              {formatCurrency(
                sale.total_amount ?? sale.total ?? 0,
                currencyCode,
              )}
            </p>
            {totalRefunded > 0 && (
              <p className="text-xs font-medium text-destructive mt-0.5">
                -{formatCurrency(totalRefunded, currencyCode)} refunded
              </p>
            )}
          </div>
          {showProfit && (
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Total Profit
              </p>
              <p
                className={`font-medium text-base sm:text-lg ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {formatCurrency(profit, currencyCode)}
              </p>
            </div>
          )}
        </div>

        {!!effectiveSale.is_reseller_sale && isAdmin && (
          <div
            className={
              effectiveSale.markup_type === "store"
                ? "mt-3 p-3 sm:p-4 border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 rounded-lg space-y-2"
                : "mt-3 p-3 sm:p-4 border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-900 rounded-lg space-y-2"
            }
          >
            <div className="flex items-center justify-between gap-2">
              <p
                className={
                  effectiveSale.markup_type === "store"
                    ? "text-sm font-medium text-blue-700 dark:text-blue-300"
                    : "text-sm font-medium text-violet-700 dark:text-violet-300"
                }
              >
                {effectiveSale.markup_type === "store" ? "Store markup" : "Reseller markup"}:{" "}
                {formatCurrency(effectiveSale.reseller_markup_amount || 0, currencyCode)}
              </p>
              {effectiveSale.reseller_commission_redeemed ? (
                <span className="text-xs font-medium text-emerald-600">
                  {effectiveSale.reseller_commission_claim_type === "store_claim"
                    ? "Store kept markup"
                    : "Commission redeemed"}
                  {effectiveSale.reseller_commission_redeemed_at &&
                    ` on ${formatDateToDDMMYYYY(effectiveSale.reseller_commission_redeemed_at)}`}
                </span>
              ) : (
                <span className="text-xs font-medium text-amber-600">
                  Not yet redeemed
                </span>
              )}
            </div>
            {!effectiveSale.reseller_commission_redeemed && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRedeemCommission("commission")}
                  disabled={redeemMutation.isPending}
                >
                  Redeem Commission
                </Button>
                {(effectiveSale.reseller_markup_amount || 0) > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRedeemCommission("store_claim")}
                    disabled={redeemMutation.isPending}
                  >
                    Store Claims Markup
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <TransactionItemsView items={items} currencyCode={currencyCode} />
      </ScrollFade>
    </div>
  );

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        className="sm:max-w-2xl w-full max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col"
        headerClassName="px-4 pt-0 pb-2 sm:px-6 sm:pt-6 sm:pb-3 border-b sm:border-b-0 border-border"
        footer={
          <div className="p-4 sm:px-6 sm:py-4 border-t border-border bg-background pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {footer}
          </div>
        }
      >
        {content}
      </ResponsiveModal>
      {portal}
      {showPaymentModal && (
        <RecordPaymentModal
          customer={
            paymentCustomer
              ? {
                  id: paymentCustomer.id,
                  name: `${paymentCustomer.first_name} ${paymentCustomer.last_name || ""}`.trim(),
                  outstanding_balance: paymentCustomer.outstanding_balance || 0,
                  firstName: paymentCustomer.first_name || "",
                  lastName: paymentCustomer.last_name || "",
                  email: "",
                  phone: "",
                  address: "",
                  joinDate: "",
                  tier: "",
                  points: 0,
                  totalSpent: 0,
                  lastVisit: "",
                  visitCount: 0,
                  birthday: "",
                  status: "",
                }
              : null
          }
          currencyCode={currencyCode}
          defaultAmount={saleRemaining}
          helperNote="Payments settle this customer's oldest outstanding sale first; if they have older unpaid sales, this payment may not fully clear this one."
          onClose={() => setShowPaymentModal(false)}
          onSubmit={handleRecordPayment}
        />
      )}
    </>
  );
}
