"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Tag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getLoyaltyRedemptionOptions } from "@/lib/db/queries/loyalty";
import { LoyaltySettingsDialog, REDEMPTION_ICONS } from "./loyalty-settings-dialog";

interface Tier {
  name: string;
  minSpent: number;
  pointsMultiplier: number;
  benefits: string[];
  color: string;
}

const ICON_BG: Record<string, string> = {
  tag: "bg-sky-100 text-sky-700",
  truck: "bg-violet-100 text-violet-700",
  gift: "bg-emerald-100 text-emerald-700",
  star: "bg-amber-100 text-amber-700",
  percent: "bg-rose-100 text-rose-700",
};

export function LoyaltyTab({
  tiers,
  currencyCode = "NGN",
}: {
  tiers: Tier[];
  currencyCode?: string;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: optionsData } = useQuery({
    queryKey: ["loyalty_redemption_options"],
    queryFn: getLoyaltyRedemptionOptions,
  });
  const redemptionOptions = (optionsData || []).filter((o) => o.is_active);

  return (
    <div className="space-y-4">
      <Card className="border rounded-[14px] p-4 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-[16px] font-semibold">
              Loyalty Tiers Configuration
            </h3>
            <p className="text-[12px] text-muted-foreground mt-1">
              Manage customer rewards and point multipliers
            </p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-[13px] font-medium border px-3 py-1.5 rounded-[8px] hover:bg-primary/10"
          >
            Edit Settings
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className="rounded-[12px] p-3 relative overflow-hidden border border-border"
            >
              <div className={`absolute top-0 left-0 w-full h-1 ${tier.color}`} />
              <div className="flex justify-between items-start mb-4 mt-2">
                <h4 className="text-[16px] font-bold">{tier.name}</h4>
                <div
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${tier.color}`}
                >
                  {tier.pointsMultiplier}x Points
                </div>
              </div>
              <div className="text-[12px] text-muted-foreground mb-3">
                Min. spend: {formatCurrency(tier.minSpent, currencyCode)}
              </div>
              <div className="space-y-2">
                {tier.benefits.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <svg
                      className="w-3.5 h-3.5 text-emerald-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {benefit}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border rounded-[14px] p-4 shadow-sm">
        <div>
          <h3 className="text-[16px] font-semibold">
            Points Redemption Options
          </h3>
          <p className="text-[12px] text-muted-foreground mt-1">
            Available rewards and redemption rates
          </p>
        </div>

        {redemptionOptions.length === 0 && (
          <p className="text-[12px] text-muted-foreground text-center py-4">
            No redemption options configured yet.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {redemptionOptions.map((option) => {
            const Icon = REDEMPTION_ICONS[option.icon_key] || Tag;
            return (
              <div
                key={option.id}
                className="rounded-[12px] p-4 border border-border"
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <div
                    className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${ICON_BG[option.icon_key] || ICON_BG.tag}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-semibold">
                      {option.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {Number(option.points_cost).toLocaleString()} points
                    </div>
                  </div>
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {option.description}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <LoyaltySettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
