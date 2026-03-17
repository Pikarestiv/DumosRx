"use client";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  TrendingUp, 
  TrendingDown 
} from "lucide-react";

interface CustomerBehaviorTabProps {
  customerMetrics: any[];
}

export function CustomerBehaviorTab({
  customerMetrics
}: CustomerBehaviorTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {customerMetrics.map((metric) => (
          <Card key={metric.metric}>
            <CardHeader className="pb-2">
              <CardDescription>{metric.metric}</CardDescription>
              <CardTitle className="text-2xl">{metric.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1">
                {metric.trend === "up" ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span
                  className={`text-sm font-medium ${
                    metric.trend === "up"
                      ? "text-emerald-500"
                      : "text-red-500"
                  }`}
                >
                  {metric.change}
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  vs last month
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer Purchase Patterns</CardTitle>
          <CardDescription>
            Peak hours and transaction frequency
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time Period</TableHead>
                <TableHead>Transactions</TableHead>
                <TableHead>Avg. Value</TableHead>
                <TableHead>Popular Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Morning (8am-12pm)</TableCell>
                <TableCell>425</TableCell>
                <TableCell>₦8,420</TableCell>
                <TableCell>Prescriptions</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Afternoon (12pm-5pm)</TableCell>
                <TableCell>856</TableCell>
                <TableCell>₦12,150</TableCell>
                <TableCell>OTC Medicines</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Evening (5pm-9pm)</TableCell>
                <TableCell>632</TableCell>
                <TableCell>₦18,900</TableCell>
                <TableCell>Supplements</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
