"use client";

import { CustomerMetrics } from "@/lib/hooks/use-customer-data";
import { Card } from "@/components/ui/card";

export function OverviewTab({ metrics }: { metrics: CustomerMetrics | null }) {
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
        <h3 className="text-[14px] font-semibold mb-4">
          Customer Segmentation
        </h3>
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
              <div className="text-[13px] font-semibold">{seg.percentage}%</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Customer Retention */}
      <Card className="border rounded-[14px] p-5 shadow-sm flex flex-col justify-center items-center text-center">
        <h3 className="text-[14px] font-semibold mb-4 w-full text-left">
          Retention & Engagement
        </h3>
        <div className="grid grid-cols-2 w-full gap-4">
          <div className="border border-border rounded-lg p-4">
            <div className="text-[12px] text-muted-foreground mb-1">
              Retention Rate
            </div>
            <div className="text-[24px] font-bold text-foreground">
              {metrics.retentionRate.toFixed(1)}%
            </div>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-[12px] text-muted-foreground mb-1">
              Avg Visits/Mo
            </div>
            <div className="text-[24px] font-bold text-foreground">
              {metrics.avgVisits.toFixed(1)}
            </div>
          </div>
        </div>
        <div className="mt-4 w-full border border-border rounded-lg p-4 flex justify-between items-center">
          <div className="text-[12px] text-muted-foreground">
            Average Transaction Value
          </div>
          <div className="text-[16px] font-bold text-foreground">
            ₦{" "}
            {metrics.avgTransaction.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
