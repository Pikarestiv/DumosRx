import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveTabLabel } from "@/components/ui/responsive-tab-label";

/**
 * Tab nav for the customer management page (Overview/Directory/Activity/Loyalty).
 * Must be rendered inside the parent's `<Tabs value=... onValueChange=...>` so
 * it shares that Tabs root's context with the page's `<TabsContent>` panels.
 */
export function CustomerTabNav() {
  return (
    <TabsList className="w-full md:w-max bg-background border rounded-[11px] p-1 h-auto overflow-x-auto justify-start">
      <TabsTrigger
        value="overview"
        className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-5 py-2"
      >
        Overview
      </TabsTrigger>
      <TabsTrigger
        value="directory"
        className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-5 py-2"
      >
        Directory
      </TabsTrigger>
      <TabsTrigger
        value="activity"
        className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-5 py-2"
      >
        Activity
      </TabsTrigger>
      <TabsTrigger
        value="loyalty"
        className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-5 py-2"
      >
        <ResponsiveTabLabel short="Loyalty" long="Loyalty Program" />
      </TabsTrigger>
    </TabsList>
  );
}
