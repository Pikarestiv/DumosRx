import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PurchaseOrderStatusFilterProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function PurchaseOrderStatusFilter({
  activeTab,
  onTabChange,
}: PurchaseOrderStatusFilterProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={onTabChange}
      className="w-full"
      variant="chips"
    >
      <TabsList className="w-full md:w-max justify-start overflow-x-auto hide-scrollbar">
        <TabsTrigger
          value="all"
          className="border border-border/50 data-[state=inactive]:bg-card data-[state=inactive]:border-border data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:bg-primary/10"
        >
          All Orders
        </TabsTrigger>
        <TabsTrigger
          value="pending"
          className="border border-border/50 data-[state=inactive]:bg-card data-[state=inactive]:border-border data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:bg-primary/10"
        >
          Drafts
        </TabsTrigger>
        <TabsTrigger
          value="sent"
          className="border border-border/50 data-[state=inactive]:bg-card data-[state=inactive]:border-border data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:bg-primary/10"
        >
          Sent
        </TabsTrigger>
        <TabsTrigger
          value="received"
          className="border border-border/50 data-[state=inactive]:bg-card data-[state=inactive]:border-border data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:bg-primary/10"
        >
          Received
        </TabsTrigger>
        <TabsTrigger
          value="missing-expiry"
          className="data-[state=inactive]:bg-card data-[state=inactive]:border-border data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:text-primary data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-600 data-[state=active]:hover:text-orange-600 data-[state=active]:border-orange-600"
        >
          Missing Expiry
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
