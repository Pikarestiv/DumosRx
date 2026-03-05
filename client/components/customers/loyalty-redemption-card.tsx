"use client";

import { Gift } from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";

export function LoyaltyRedemptionCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Points Redemption Options</CardTitle>
        <CardDescription>
          Available rewards and redemption rates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <Gift className="h-8 w-8 text-blue-500" />
              <div>
                <h4 className="font-medium">₦500 Discount</h4>
                <p className="text-sm text-gray-500">500 points</p>
              </div>
            </div>
            <p className="text-sm">Get ₦500 off your next purchase</p>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <Gift className="h-8 w-8 text-green-500" />
              <div>
                <h4 className="font-medium">₦1,000 Discount</h4>
                <p className="text-sm text-gray-500">900 points</p>
              </div>
            </div>
            <p className="text-sm">Get ₦1,000 off your next purchase</p>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <Gift className="h-8 w-8 text-purple-500" />
              <div>
                <h4 className="font-medium">Free Delivery</h4>
                <p className="text-sm text-gray-500">200 points</p>
              </div>
            </div>
            <p className="text-sm">Free delivery on your next order</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
