"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface SupplierStatusFilterProps {
  filter: string;
  setFilter: (val: string) => void;
}

/** Filter chips, not tabs. Narrows the list/table above; no content switch of its own. */
export function SupplierStatusFilter({
  filter,
  setFilter,
}: SupplierStatusFilterProps) {
  return (
    <Tabs variant="chips" value={filter} onValueChange={setFilter}>
      <TabsList className="w-full md:w-max justify-start overflow-x-auto hide-scrollbar">
        <TabsTrigger
          value="all"
          className={cn(
            // active
            "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none",
            // inactive
            "data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground",
            // inactive + hover
            "data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50",
          )}
        >
          All
        </TabsTrigger>
        <TabsTrigger
          value="debt"
          className={cn(
            // active
            "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none",
            // inactive
            "data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground",
            // inactive + hover
            "data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50",
          )}
        >
          Has debt
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
