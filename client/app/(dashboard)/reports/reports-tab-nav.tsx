import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveTabLabel } from "@/components/ui/responsive-tab-label";

interface ReportsTabNavProps {
  isAdmin: boolean;
}

const tabTriggerClass =
  "h-10 px-5 rounded-lg text-[13px] font-semibold gap-1.5 whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-transparent shadow-none";

/**
 * Tab nav for the reports page. Must be rendered inside the parent's
 * `<Tabs value=... onValueChange=...>` so it shares that Tabs root's
 * context with the page's `<TabsContent>` panels.
 */
export function ReportsTabNav({ isAdmin }: ReportsTabNavProps) {
  return (
    <TabsList className="w-full md:w-max inline-flex gap-1 bg-background border rounded-[11px] p-1 h-auto overflow-x-auto">
      {isAdmin && (
        <TabsTrigger value="reports" className={tabTriggerClass}>
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          <ResponsiveTabLabel short="Operational" long="Operational Reports" />
        </TabsTrigger>
      )}
      <TabsTrigger value="daily_close" className={tabTriggerClass}>
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Daily Close
      </TabsTrigger>
      {isAdmin && (
        <TabsTrigger value="analytics" className={tabTriggerClass}>
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M23 6l-9.5 9.5-5-5L1 18" />
          </svg>
          <ResponsiveTabLabel short="Analytics" long="Analytics & Insights" />
        </TabsTrigger>
      )}
    </TabsList>
  );
}
