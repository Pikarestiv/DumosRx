import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FILTER_TYPES } from "./stock-movement-utils";

interface StockMovementTypeFilterProps {
  typeFilter: string;
  setTypeFilter: (val: string) => void;
  triggerClassName?: string;
}

export function StockMovementTypeFilter({
  typeFilter,
  setTypeFilter,
  triggerClassName = "",
}: StockMovementTypeFilterProps) {
  return (
    <Tabs value={typeFilter} onValueChange={setTypeFilter} variant="chips">
      <TabsList>
        {FILTER_TYPES.map((ft) => (
          <TabsTrigger key={ft.id} value={ft.id} className={triggerClassName}>
            {ft.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
