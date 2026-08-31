"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PaymentMethodSelectProps {
  value?: string;
  onChange: (paymentMethod: string | undefined) => void;
  className?: string;
}

/** Filters a report/analytics query down to one payment method - maps to
 * sales.payment_method. Options mirror daily-close/sales-list-modal.tsx's
 * payment filter so the same method names/values are used everywhere. */
export function PaymentMethodSelect({ value, onChange, className }: PaymentMethodSelectProps) {
  return (
    <Select
      value={value ?? "all"}
      onValueChange={(v) => onChange(v === "all" ? undefined : v)}
    >
      <SelectTrigger className={className ?? "w-[150px] h-9 text-[13px]"}>
        <SelectValue placeholder="Payment Method" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All methods</SelectItem>
        <SelectItem value="cash">Cash</SelectItem>
        <SelectItem value="card">POS / Card</SelectItem>
        <SelectItem value="transfer">Transfer</SelectItem>
        <SelectItem value="credit">Credit</SelectItem>
        <SelectItem value="mixed">Mixed</SelectItem>
      </SelectContent>
    </Select>
  );
}
