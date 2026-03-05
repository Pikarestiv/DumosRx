"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Award, Gift, Heart } from "lucide-react";
import { Customer } from "@/lib/hooks/use-customer-data";

interface CustomerStatsProps {
  customers: Customer[];
}

export function CustomerStats({ customers }: CustomerStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Customers
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {customers.length.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">In database</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Loyalty Members
          </CardTitle>
          <Award className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {customers.filter((c) => c.points > 0).length.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">
            With loyalty points
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Points</CardTitle>
          <Gift className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {customers.reduce((sum, c) => sum + c.points, 0).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Accumulated</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg. Points</CardTitle>
          <Heart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {customers.length > 0
              ? Math.round(
                  customers.reduce((sum, c) => sum + c.points, 0) /
                    customers.length,
                ).toLocaleString()
              : 0}
          </div>
          <div className="text-xs text-muted-foreground">Per customer</div>
        </CardContent>
      </Card>
    </div>
  );
}
