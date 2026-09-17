import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILTER_TYPES } from "./stock-movement-utils";

interface StockMovementTypeFilterProps {
  typeFilter: string;
  setTypeFilter: (val: string) => void;
  className?: string;
}

/** Compact type dropdown, not chips - frees up horizontal room to sit on
 * the same line as the date range picker instead of its own row. */
export function StockMovementTypeFilter({
  typeFilter,
  setTypeFilter,
  className,
}: StockMovementTypeFilterProps) {
  return (
    <Select value={typeFilter} onValueChange={setTypeFilter}>
      <SelectTrigger className={className ?? "w-[150px] h-9 text-[13px]"}>
        <SelectValue placeholder="Type" />
      </SelectTrigger>
      <SelectContent>
        {FILTER_TYPES.map((ft) => (
          <SelectItem key={ft.id} value={ft.id}>
            {ft.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
