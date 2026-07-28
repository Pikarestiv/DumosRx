import { ChevronRight } from "lucide-react";
import { Customer } from "@/lib/hooks/use-customer-data";
import { formatCurrency } from "@/lib/utils";

interface RowCommonProps {
  customer: Customer;
  isSelected: boolean;
  onSelect: (customer: Customer) => void;
  getTierColor: (tier: string) => string;
}

export function CustomerMobileRow({
  customer,
  isSelected,
  onSelect,
  getTierColor,
}: RowCommonProps) {
  return (
    <div
      onClick={() => onSelect(customer)}
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isSelected ? "bg-primary/10 border-primary/30" : "bg-card hover:bg-primary/5"}`}
    >
      <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[13px]">
        {customer.name.substring(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold truncate">
          {customer.name}
        </div>
        <div className="text-[11.5px] text-muted-foreground truncate">
          {customer.phone || customer.email || "No contact info"}
        </div>
      </div>
      <div
        className={`shrink-0 text-[10px] font-medium px-2 py-1 rounded-full text-white ${getTierColor(customer.tier)}`}
      >
        {customer.tier}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  );
}

interface DesktopRowProps extends RowCommonProps {
  currencyCode: string;
  style: React.CSSProperties;
}

export function CustomerDesktopRow({
  customer,
  isSelected,
  onSelect,
  getTierColor,
  currencyCode,
  style,
}: DesktopRowProps) {
  return (
    <div
      onClick={() => onSelect(customer)}
      className={`absolute top-0 left-0 w-full grid grid-cols-[1.6fr_1.1fr_80px_70px_100px_110px] items-center gap-2 px-4 py-2.5 cursor-pointer border-b transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-primary/5"}`}
      style={style}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[13px]">
          {customer.name.substring(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold truncate">
            {customer.name}
          </div>
        </div>
      </div>
      <div className="text-[12px] text-muted-foreground truncate">
        {customer.phone || customer.email || "No contact info"}
      </div>
      <div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full text-white ${getTierColor(customer.tier)}`}
        >
          {customer.tier}
        </span>
      </div>
      <div className="text-[12.5px] text-right text-emerald-600 font-medium">
        {customer.points.toLocaleString()}
      </div>
      <div
        className={`text-[12.5px] text-right font-medium ${customer.outstanding_balance > 0 ? "text-destructive" : "text-muted-foreground"}`}
      >
        {customer.outstanding_balance > 0
          ? formatCurrency(customer.outstanding_balance, currencyCode)
          : "-"}
      </div>
      <div className="text-[12px] text-right text-muted-foreground">
        {customer.lastVisit}
      </div>
    </div>
  );
}
