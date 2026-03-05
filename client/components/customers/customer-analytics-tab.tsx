"use client";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";

export function CustomerAnalyticsTab() {
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
            Monthly retention and churn analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                78.5%
              </div>
              <p className="text-sm text-gray-500">
                Overall Retention Rate
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">2.3x</div>
              <p className="text-sm text-gray-500">Avg. Monthly Visits</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">
                ₦15,420
              </div>
              <p className="text-sm text-gray-500">
                Avg. Transaction Value
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
