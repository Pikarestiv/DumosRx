import React from 'react';
import { format, parseISO } from 'date-fns';
import { Receipt, RotateCcw, Banknote, CreditCard, ArrowLeftRight, Pill } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

export function TransactionItem({
  sale,
  currencyCode,
  canReturn,
  onClick,
  onReturnClick,
}: any) {
  const time = sale.created_at
    ? format(parseISO(sale.created_at), "h:mm a")
    : "";
  const itemCount = sale.item_count || 1;
  const amount = Number(sale.total_amount) || Number(sale.total) || 0;

  const getPaymentIcon = (method: string) => {
    switch (method?.toLowerCase()) {
      case "cash":
        return <Banknote className="h-5 w-5 text-emerald-600" />;
      case "card":
        return <CreditCard className="h-5 w-5 text-blue-600" />;
      case "transfer":
        return <ArrowLeftRight className="h-5 w-5 text-purple-600" />;
      default:
        return <Receipt className="h-5 w-5 text-gray-600" />;
    }
  };

  const getPaymentIconBg = (method: string) => {
    switch (method?.toLowerCase()) {
      case "cash":
        return "bg-emerald-100";
      case "card":
        return "bg-blue-100";
      case "transfer":
        return "bg-purple-100";
      default:
        return "bg-gray-100";
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase() || "completed";
    if (s === "completed")
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100/80 border-0"
        >
          Completed
        </Badge>
      );
    if (s === "refunded")
      return (
        <Badge
          variant="secondary"
          className="bg-red-100 text-red-700 hover:bg-red-100/80 border-0"
        >
          Refunded
        </Badge>
      );
    if (s === "resumed hold")
      return (
        <Badge
          variant="secondary"
          className="bg-amber-100 text-amber-700 hover:bg-amber-100/80 border-0"
        >
          Resumed hold
        </Badge>
      );
    if (s === "partially_refunded")
      return (
        <Badge
          variant="secondary"
          className="bg-amber-100 text-amber-700 hover:bg-amber-100/80 border-0"
        >
          Partially refunded
        </Badge>
      );
    if (s === "partial")
      return (
        <Badge
          variant="secondary"
          className="bg-amber-100 text-amber-700 hover:bg-amber-100/80 border-0"
        >
          Partially paid
        </Badge>
      );
    if (s === "pending")
      return (
        <Badge
          variant="secondary"
          className="bg-orange-100 text-orange-700 hover:bg-orange-100/80 border-0"
        >
          Pending
        </Badge>
      );
    return (
      <Badge
        variant="secondary"
        className="bg-gray-100 text-gray-700 hover:bg-gray-100/80 border-0 capitalize"
      >
        {s}
      </Badge>
    );
  };

  return (
    <div
      className="bg-card text-card-foreground p-3 rounded-2xl shadow-sm border border-border/50 cursor-pointer hover:border-primary/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between group gap-3 sm:gap-0"
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1 w-full">
        <div
          className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${getPaymentIconBg(sale.payment_method)}`}
        >
          {getPaymentIcon(sale.payment_method)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[15px] text-foreground mb-0.5 truncate flex items-center gap-1.5">
            <span className="truncate">
              Sale #{sale.transaction_number} &middot;{" "}
              {sale.customer_name || "Walk-in"}
            </span>
            {!!sale.prescription_id && (
              <Badge
                variant="secondary"
                className="bg-primary/10 text-primary hover:bg-primary/10 border-0 shrink-0 gap-1 px-1.5"
              >
                <Pill className="h-3 w-3" />
                Rx
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {time && `${time} · `}
            {itemCount} item{itemCount !== 1 ? "s" : ""} &middot;{" "}
            <span className="capitalize">
              {sale.payment_method || "Unknown"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end w-full sm:w-auto gap-4">
        {canReturn && (
          <Button
            variant="ghost"
            size="sm"
            className="text-accent opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex"
            onClick={(e) => {
              e.stopPropagation();
              onReturnClick(sale);
            }}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Return
          </Button>
        )}

        <div className="flex items-center gap-3 shrink-0">
          <div className="font-bold font-serif text-[15px]">
            {formatCurrency(amount, currencyCode)}
          </div>
          {getStatusBadge(sale.payment_status)}
        </div>
      </div>
    </div>
  );
}
