import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

interface PurchaseOrderMetricsProps {
  totalOrders: number;
  pendingOrders: number;
  draftOrders: number;
  totalOrderValue: number;
}

export function PurchaseOrderMetrics({
  totalOrders,
  pendingOrders,
  draftOrders,
  totalOrderValue,
}: PurchaseOrderMetricsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-bold">{totalOrders}</p>
            </div>
            <FileText className="h-8 w-8 text-primary" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pending Orders</p>
              <p className="text-2xl font-bold text-orange-600">
                {pendingOrders}
              </p>
            </div>
            <FileText className="h-8 w-8 text-orange-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Draft Orders</p>
              <p className="text-2xl font-bold text-muted-foreground">
                {draftOrders}
              </p>
            </div>
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="text-2xl font-bold">
                {formatCurrency(totalOrderValue)}
              </p>
            </div>
            <FileText className="h-8 w-8 text-accent" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
