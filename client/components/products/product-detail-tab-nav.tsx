import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Tab nav only; pairs with sibling <TabsContent> panels owned by the parent, which switches page content on selection. */
export function ProductDetailTabNav() {
  return (
    <TabsList className="w-full flex justify-between bg-transparent border-none !shadow-none p-0 h-auto space-x-2">
      <TabsTrigger
        value="details"
        className="flex-1 py-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground shadow-none"
      >
        Details
      </TabsTrigger>
      <TabsTrigger
        value="batches"
        className="flex-1 py-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground shadow-none"
      >
        Batches
      </TabsTrigger>
      <TabsTrigger
        value="history"
        className="flex-1 py-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground shadow-none"
      >
        History
      </TabsTrigger>
    </TabsList>
  );
}
