"use client";

interface Tier {
  name: string;
  minSpent: number;
  pointsMultiplier: number;
  benefits: string[];
  color: string;
}

export function LoyaltyTab({ tiers }: { tiers: Tier[] }) {
  return (
    <div className="bg-background border rounded-[14px] p-5 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-[16px] font-semibold">Loyalty Tiers Configuration</h3>
          <p className="text-[12px] text-muted-foreground mt-1">Manage customer rewards and point multipliers</p>
        </div>
        <button className="text-[13px] font-medium border px-3 py-1.5 rounded-[8px] hover:bg-secondary transition-colors">
          Edit Settings
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiers.map((tier) => (
          <div key={tier.name} className="border rounded-[12px] p-4 relative overflow-hidden bg-secondary/20">
            <div className={`absolute top-0 left-0 w-full h-1 ${tier.color}`} />
            <div className="flex justify-between items-start mb-4 mt-2">
              <h4 className="text-[16px] font-bold">{tier.name}</h4>
              <div className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${tier.color}`}>
                {tier.pointsMultiplier}x Points
              </div>
            </div>
            <div className="text-[12px] text-muted-foreground mb-4 pb-4 border-b">
              Min. spend: ₦ {tier.minSpent.toLocaleString()}
            </div>
            <div className="space-y-2">
              {tier.benefits.map((benefit, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {benefit}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
