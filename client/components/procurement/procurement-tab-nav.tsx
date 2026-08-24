import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveTabLabel } from "@/components/ui/responsive-tab-label";

/** Tab nav only; pairs with sibling <TabsContent> panels owned by the parent, which switches page content on selection. */
export function ProcurementTabNav() {
  return (
    <TabsList className="w-full md:w-max inline-flex gap-1 bg-card border border-border rounded-[11px] p-1 h-auto overflow-x-auto">
      <TabsTrigger
        value="orders"
        className="px-5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-transparent shadow-none"
      >
        <ResponsiveTabLabel short="Orders" long="Purchase Orders" />
      </TabsTrigger>
      <TabsTrigger
        value="requests"
        className="px-5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-transparent shadow-none"
      >
        <ResponsiveTabLabel short="Requests" long="Requested Products" />
      </TabsTrigger>
      <TabsTrigger
        value="suppliers"
        className="px-5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-transparent shadow-none"
      >
        Vendors
      </TabsTrigger>
    </TabsList>
  );
}
