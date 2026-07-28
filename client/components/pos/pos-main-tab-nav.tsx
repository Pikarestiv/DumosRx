import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Tab nav only — pairs with sibling <TabsContent> panels owned by the parent, which switches page content on selection. */
export function POSMainTabNav() {
  return (
    <TabsList className="w-full md:w-auto">
      <TabsTrigger value="products">Products</TabsTrigger>
      <TabsTrigger value="history">Recent Sales</TabsTrigger>
    </TabsList>
  );
}
