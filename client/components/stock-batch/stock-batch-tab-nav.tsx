import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Tab nav only; pairs with sibling <TabsContent> panels owned by the parent, which switches page content on selection. */
export function StockBatchTabNav({
  canManageStockBatch,
}: {
  canManageStockBatch: boolean;
}) {
  return (
    <TabsList className="w-full md:w-max">
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="catalog">Catalog</TabsTrigger>
      {canManageStockBatch && (
        <TabsTrigger value="ledger">Movements</TabsTrigger>
      )}
    </TabsList>
  );
}
