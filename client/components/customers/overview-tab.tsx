"use client";

import { CustomerMetrics } from "@/lib/hooks/use-customer-data";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";

export function OverviewTab({ metrics }: { metrics: CustomerMetrics | null }) {
  const { storeProfile } = useStore();
  if (!metrics) return null;

  // Map tiers to our theme colors based on logic in customer-management
  const getTierColorClass = (tier: string) => {
    switch (tier) {
      case "Platinum":
        return "bg-purple-600";
      case "Gold":
        return "bg-yellow-500";
      case "Silver":
        return "bg-gray-400";
      default:
        return "bg-amber-600";
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Customer Segmentation */}
      <Card className="border rounded-[14px] p-5 shadow-sm">
        <h3 className="text-[14px] font-semibold">Customer Segmentation</h3>
        <div>
          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden flex mb-5">
            {metrics.segmentation.map((seg) => (
              <div
                key={seg.name}
                className={`${getTierColorClass(seg.name)} h-full`}
                style={{ width: `${seg.percentage}%` }}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-y-4 gap-x-2">
            {metrics.segmentation.map((seg) => (
              <div key={seg.name} className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${getTierColorClass(seg.name)}`}
                />
                <div className="text-[13px] text-muted-foreground flex-1">
                  {seg.name}
                </div>
                <div className="text-[13px] font-semibold">
                  {seg.percentage}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Purchase engagement over the trailing 30 days.
          getCustomerRetentionMetrics() looks only at sales from the last 30
          days that carry a customer_id, so every number in this card is
          "last 30 days, identified customers only":
            - retentionRate = customers with >1 sale in the window / customers
              with >=1 sale in the window. That is a repeat-purchase rate
              inside one window, not retention of a prior cohort or of the
              store's customer base, so it is labelled for what it computes
              (matching the dashboard tile in lib/hooks/use-bi-data.ts).
            - avgVisits = sales in the window / customers who bought in the
              window, i.e. visits per *buying* customer, not per registered
              customer and not store-wide visits. */}
      <Card className="border rounded-[14px] p-5 shadow-sm flex flex-col justify-center items-center text-center">
        <h3 className="text-[14px] font-semibold w-full text-left">
          Engagement (Last 30 Days)
        </h3>
        <div className="grid grid-cols-2 w-full gap-4">
          <div className="border border-border rounded-lg p-4">
            <div className="text-[12px] text-muted-foreground mb-1">
              Repeat Purchase Rate
            </div>
            <div className="text-[24px] font-bold text-foreground">
              {metrics.retentionRate.toFixed(1)}%
            </div>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-[12px] text-muted-foreground mb-1">
              Avg Visits/Customer
            </div>
            <div className="text-[24px] font-bold text-foreground">
              {metrics.avgVisits.toFixed(1)}
            </div>
          </div>
        </div>
        <div className="w-full border border-border rounded-lg p-4 flex flex-col xs:flex-row justify-between items-center">
          <div className="text-[12px] text-muted-foreground">
            Average Transaction Value
          </div>
          <div className="text-[16px] font-bold text-foreground">
            {formatCurrency(metrics.avgTransaction, storeProfile?.currency)}
          </div>
        </div>
      </Card>
    </div>
  );
}
