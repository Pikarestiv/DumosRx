"use client";

import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
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
}

/** Single filter row shared by Operational Reports and Analytics & Insights
 * (mounted once per tab, not once per report page) - the simplification
 * over Moniebook's per-report-page filter chips. No branch/store filter
 * here on purpose: switching stores via the header selector already
 * re-scopes every report/analytics query (see getActiveStoreId()). */
export function ReportFiltersBar({ value, onChange, className }: ReportFiltersBarProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2.5 ${className ?? ""}`}>
      <DateRangePicker
        value={value.dateRange}
        onChange={(dateRange) => onChange({ ...value, dateRange })}
      />
      <StaffSelect
        value={value.staffId}
        onChange={(staffId) => onChange({ ...value, staffId })}
      />
      <PaymentMethodSelect
        value={value.paymentMethod}
        onChange={(paymentMethod) => onChange({ ...value, paymentMethod })}
      />
    </div>
  );
}
