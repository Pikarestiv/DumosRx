import { ChevronLeft, AlertCircle } from "lucide-react";
import { Customer } from "@/lib/hooks/use-customer-data";
import { formatCurrency } from "@/lib/utils";

interface CustomerDetailPanelProps {
  customer: Customer;
  currencyCode: string;
  getTierColor: (tier: string) => string;
  onBack: () => void;
  onViewHistory?: (customer: Customer) => void;
  onEditProfile?: (customer: Customer) => void;
  onRecordPayment?: (customer: Customer) => void;
}

export function CustomerDetailPanel({
  customer,
  currencyCode,
  getTierColor,
  onBack,
  onViewHistory,
  onEditProfile,
  onRecordPayment,
}: CustomerDetailPanelProps) {
  const detailFields = [
    { label: "Phone", value: customer.phone || "Not provided" },
    { label: "Address", value: customer.address || "Not provided" },
    { label: "Date of Birth", value: customer.birthday || "Not provided" },
    { label: "Joined", value: customer.joinDate },
    {
      label: "Total Spent",
      value: formatCurrency(customer.totalSpent, currencyCode),
    },
    {
      label: "Loyalty Points",
      value: `${customer.points.toLocaleString()} pts`,
      valueClassName: "text-emerald-600",
    },
    { label: "Last Visit", value: customer.lastVisit },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 md:p-5 border-b flex items-center gap-3">
        <button
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground shrink-0"
          onClick={onBack}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-12 h-12 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[18px]">
          {customer.name.substring(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold truncate">
            {customer.name}
          </div>
          <div className="text-[12px] text-muted-foreground truncate">
            {customer.email || "No email provided"}
          </div>
        </div>
        <span
          className={`text-[10.5px] font-semibold px-2.5 py-1 rounded-md shrink-0 text-white ${getTierColor(customer.tier)}`}
        >
          {customer.tier}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        {customer.outstanding_balance > 0 && (
          <div className="border border-destructive/20 bg-destructive/5 rounded-[12px] p-4 mb-5">
            <div className="flex items-center justify-between mb-1 gap-2">
              <div className="text-[11px] font-semibold text-destructive uppercase tracking-wide flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Outstanding balance
              </div>
              <div className="text-[13px] font-bold text-destructive whitespace-nowrap">
                {formatCurrency(customer.outstanding_balance, currencyCode)}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => onRecordPayment?.(customer)}
                className="flex-1 bg-destructive text-destructive-foreground py-2 rounded-[8px] text-[12.5px] font-semibold hover:bg-destructive/90 transition-colors"
              >
                Record Payment
              </button>
              {/* Send Reminder: disabled until an SMS/email service is wired up */}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {detailFields.map((field) => (
            <div key={field.label}>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {field.label}
              </div>
              <div
                className={`text-[13.5px] font-medium ${field.valueClassName || ""}`}
              >
                {field.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-5 pt-4 border-t flex gap-2.5">
        <button
          onClick={() => onEditProfile?.(customer)}
          className="flex-1 border bg-background text-foreground py-2.5 rounded-xl text-[13px] font-semibold hover:bg-primary/5 transition-colors"
        >
          Edit Profile
        </button>
        <button
          onClick={() => onViewHistory?.(customer)}
          className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl text-[13px] font-semibold hover:bg-primary/90 transition-colors"
        >
          View History
        </button>
      </div>
    </div>
  );
}
