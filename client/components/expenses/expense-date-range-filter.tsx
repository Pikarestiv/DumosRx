"use client";

import {
  DateRangePicker,
  type DateRangeValue,
} from "@/components/ui/date-range-picker";

interface ExpenseDateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}

export function ExpenseDateRangeFilter({ value, onChange }: ExpenseDateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <DateRangePicker value={value} onChange={onChange} />
      {value.from && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="text-[11.5px] text-muted-foreground hover:text-foreground underline px-0.5"
        >
          Clear date range
        </button>
      )}
    </div>
  );
}
