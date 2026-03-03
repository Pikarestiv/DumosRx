"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";

interface LoyaltyTier {
  name: string;
  minSpent: number;
  pointsMultiplier: number;
  benefits: (string | React.ReactNode)[];
  color: string;
}

interface LoyaltyTiersViewProps {
  tiers: LoyaltyTier[];
}

export function LoyaltyTiersView({ tiers }: LoyaltyTiersViewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loyalty Program Tiers</CardTitle>
        <CardDescription>Membership levels and benefits structure</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => (
            <Card key={tier.name} className="relative">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{tier.name}</CardTitle>
                  <div className={`w-4 h-4 rounded-full ${tier.color}`} />
                </div>
                <CardDescription>Minimum spend: ₦{tier.minSpent.toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm">{tier.pointsMultiplier}x points multiplier</span>
                  </div>
                  <div className="space-y-1">
                    {tier.benefits.map((benefit, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-sm">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
