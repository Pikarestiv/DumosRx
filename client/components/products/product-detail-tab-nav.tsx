import { TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProductDetailTabNavProps {
  batchCount?: number;
}

export function ProductDetailTabNav({ batchCount = 0 }: ProductDetailTabNavProps) {
  return (
    <TabsList className="w-full flex justify-start bg-transparent border-b border-border/60 !shadow-none p-0 h-auto gap-6 rounded-none">
      <TabsTrigger
        value="details"
        className="pb-2 px-1 text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=inactive]:text-muted-foreground bg-transparent shadow-none"
      >
        Details
      </TabsTrigger>
      <TabsTrigger
        value="batches"
        className="pb-2 px-1 text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=inactive]:text-muted-foreground bg-transparent shadow-none"
      >
        Batches ({batchCount})
      </TabsTrigger>
      <TabsTrigger
        value="history"
        className="pb-2 px-1 text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=inactive]:text-muted-foreground bg-transparent shadow-none"
      >
        Movements
      </TabsTrigger>
    </TabsList>
  );
}
