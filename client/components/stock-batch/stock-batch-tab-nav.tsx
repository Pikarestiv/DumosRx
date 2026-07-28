import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function StockBatchTabNav() {
  return (
    <TabsList className="w-full md:w-max">
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="catalog">Catalog</TabsTrigger>
      <TabsTrigger value="ledger">Ledger</TabsTrigger>
    </TabsList>
  );
}
