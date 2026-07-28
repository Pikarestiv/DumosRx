import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function POSMainTabNav() {
  return (
    <TabsList className="w-full md:w-auto">
      <TabsTrigger value="products">Products</TabsTrigger>
      <TabsTrigger value="history">Recent Sales</TabsTrigger>
    </TabsList>
  );
}
