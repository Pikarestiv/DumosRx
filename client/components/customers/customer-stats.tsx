"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Award, Gift, Heart } from "lucide-react";
import { Customer } from "@/lib/hooks/use-customer-data";

interface CustomerStatsProps {
  customers: Customer[];
}

export function CustomerStats({ customers }: CustomerStatsProps) {
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-[10px] sm:gap-6 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">
              Total Customers
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {customers.length.toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs text-muted-foreground">In database</div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">
              Loyalty Members
            </CardTitle>
            <Award className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {customers.filter((c) => c.points > 0).length.toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs text-muted-foreground">
              With loyalty points
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Points</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {customers.reduce((sum, c) => sum + c.points, 0).toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs text-muted-foreground">Accumulated</div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Avg. Points</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {customers.length > 0
                ? Math.round(
                    customers.reduce((sum, c) => sum + c.points, 0) /
                      customers.length,
                  ).toLocaleString()
                : 0}
            </div>
            <div className="text-[11px] sm:text-xs text-muted-foreground">Per customer</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
