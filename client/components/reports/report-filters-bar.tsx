"use client";

import {
  DateRangePicker,
  type DateRangeValue,
} from "@/components/ui/date-range-picker";
import { StaffSelect } from "./staff-select";
import { PaymentMethodSelect } from "./payment-method-select";

export interface ReportFiltersValue {
  dateRange: DateRangeValue;
  staffId?: string;
  paymentMethod?: string;
}

interface ReportFiltersBarProps {
  value: ReportFiltersValue;
  onChange: (value: ReportFiltersValue) => void;
  className?: string;
  /** A report whose query ignores a dimension renders no control for it,
   * rather than an inert one - see reportSupportsDateRange /
   * reportSupportsSalesFilters in lib/hooks/use-report-export.ts. */
  showDateRange?: boolean;
  showStaff?: boolean;
  showPaymentMethod?: boolean;
  /** Narrower controls that share a row inside the report view modal, where
   * the card's fixed widths overflow. */
  compact?: boolean;
}

/** Single filter row shared by Operational Reports, Analytics & Insights and
 * the Report Center's on-screen report view. **/
export function ReportFiltersBar({
  value,
  onChange,
  className,
  showDateRange = true,
  showStaff = true,
  showPaymentMethod = true,
  compact = false,
}: ReportFiltersBarProps) {
  const selectClassName = compact
    ? "w-full sm:w-[130px] h-8 text-[12px]"
    : undefined;

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-2.5 ${className ?? ""}`}
    >
      {showDateRange && (
        <DateRangePicker
          value={value.dateRange}
          onChange={(dateRange) => onChange({ ...value, dateRange })}
        />
      )}
      {showStaff && (
        <StaffSelect
          value={value.staffId}
          onChange={(staffId) => onChange({ ...value, staffId })}
          className={selectClassName}
        />
      )}
      {showPaymentMethod && (
        <PaymentMethodSelect
          value={value.paymentMethod}
          onChange={(paymentMethod) => onChange({ ...value, paymentMethod })}
          className={selectClassName}
        />
      )}
    </div>
  );
}
