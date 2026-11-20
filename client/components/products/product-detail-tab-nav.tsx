import { TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProductDetailTabNavProps {
  batchCount?: number;
}

const TAB_CLASS =
  "pb-2 px-1 text-sm rounded-none border-0 border-b-2 border-transparent bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:hover:bg-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:hover:text-primary data-[state=active]:hover:border-primary data-[state=active]:shadow-none data-[state=active]:font-semibold data-[state=inactive]:text-muted-foreground";

export function ProductDetailTabNav({ batchCount = 0 }: ProductDetailTabNavProps) {
  return (
    <TabsList className="w-full flex justify-start bg-transparent border-0 border-b border-border/60 md:border-0 md:border-b !shadow-none p-0 h-auto gap-6 rounded-none">
      <TabsTrigger value="details" className={TAB_CLASS}>
        Details
      </TabsTrigger>
      <TabsTrigger value="batches" className={TAB_CLASS}>
        Batches ({batchCount})
      </TabsTrigger>
      <TabsTrigger value="history" className={TAB_CLASS}>
        Movements
      </TabsTrigger>
    </TabsList>
  );
}
