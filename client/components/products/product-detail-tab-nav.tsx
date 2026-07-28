import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Full-width tab nav (Details/Batches/History) for the product detail panel.
 * Must be rendered inside the parent's `<Tabs>` root so it shares that Tabs
 * root's context with the panel's `<TabsContent>` blocks.
 */
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
