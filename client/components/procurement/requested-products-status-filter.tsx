import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RequestStatusFilter = "all" | "pending" | "ordered";

interface RequestedProductsStatusFilterProps {
  statusFilter: RequestStatusFilter;
  setStatusFilter: (val: RequestStatusFilter) => void;
}

export function RequestedProductsStatusFilter({
  statusFilter,
  setStatusFilter,
}: RequestedProductsStatusFilterProps) {
  return (
    <Tabs
      variant="chips"
      value={statusFilter}
      onValueChange={(v) => setStatusFilter(v as RequestStatusFilter)}
    >
      <TabsList className="w-full md:w-max justify-start overflow-x-auto hide-scrollbar">
        <TabsTrigger
          value="all"
          className="border border-border/50 data-[state=inactive]:bg-card data-[state=inactive]:border-border data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:bg-primary/10"
        >
          All
        </TabsTrigger>
        <TabsTrigger
          value="pending"
          className="border border-border/50 data-[state=inactive]:bg-card data-[state=inactive]:border-border data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:bg-primary/10"
        >
          Pending
        </TabsTrigger>
        <TabsTrigger
          value="ordered"
          className="border border-border/50 data-[state=inactive]:bg-card data-[state=inactive]:border-border data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:bg-primary/10"
        >
          Ordered
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
