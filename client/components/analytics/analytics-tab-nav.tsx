import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveTabLabel } from "@/components/ui/responsive-tab-label";

/** Tab nav only; pairs with sibling <TabsContent> panels owned by the parent, which switches page content on selection. */
export function AnalyticsTabNav() {
  return (
    <div className="w-full md:w-max inline-flex gap-1 bg-background border rounded-[11px] p-1 overflow-x-auto">
      <TabsList className="bg-transparent border-none !shadow-none p-0 flex space-x-1 h-auto">
        <TabsTrigger
          value="sales"
          className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground"
        >
          <ResponsiveTabLabel short="Sales" long="Sales Analytics" />
        </TabsTrigger>
        <TabsTrigger
          value="profit-loss"
          className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground"
        >
          <ResponsiveTabLabel short="P&L" long="Profit & Loss" />
        </TabsTrigger>
        <TabsTrigger
          value="stock_batches"
          className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground"
        >
          <ResponsiveTabLabel short="Stock" long="Stock Batch Insights" />
        </TabsTrigger>
        <TabsTrigger
          value="customers"
          className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground"
        >
          <ResponsiveTabLabel short="Customers" long="Customer Behaviour" />
        </TabsTrigger>
      </TabsList>
    </div>
  );
}
