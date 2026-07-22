"use client";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { useCustomerRetention } from "@/lib/hooks/use-analytics";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function CustomerAnalyticsTab() {
  const { data, isLoading } = useCustomerRetention();

  const renderRetentionContent = () => {
    if (isLoading) {
      return (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!data) {
      return (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No data available
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-green-600">
            {data.retentionRate.toFixed(1)}%
          </div>
          <p className="text-sm text-gray-500">
            Overall Retention Rate
          </p>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600">
            {data.avgVisits.toFixed(1)}
          </div>
          <p className="text-sm text-gray-500">
            Avg. Monthly Visits
          </p>
        </div>
        <div className="col-span-2 text-center mt-4">
          <div className="text-2xl font-bold text-purple-600">
            {formatCurrency(data.avgTransactionValue)}
          </div>
          <p className="text-sm text-gray-500">
            Avg. Transaction Value
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Customer Segmentation</CardTitle>
          <CardDescription>
            Customer distribution by tier and activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span>Platinum Members</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-gray-200 rounded-full">
                  <div className="w-3/12 h-2 bg-purple-600 rounded-full" />
                </div>
                <span className="text-sm">25%</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span>Gold Members</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-gray-200 rounded-full">
                  <div className="w-8/12 h-2 bg-yellow-500 rounded-full" />
                </div>
                <span className="text-sm">35%</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span>Silver Members</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-gray-200 rounded-full">
                  <div className="w-6/12 h-2 bg-gray-400 rounded-full" />
                </div>
                <span className="text-sm">25%</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span>Bronze Members</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-gray-200 rounded-full">
                  <div className="w-3/12 h-2 bg-amber-600 rounded-full" />
                </div>
                <span className="text-sm">15%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Customer Retention</CardTitle>
          <CardDescription>
            Retention and value metrics over the last 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderRetentionContent()}
        </CardContent>
      </Card>
    </div>
  );
}
