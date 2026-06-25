import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Edit, PackageX } from "lucide-react";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { PurchaseOrder } from "@/lib/hooks/use-purchase-orders";

interface PurchaseOrderTableProps {
  orders: PurchaseOrder[];
  filteredOrders: PurchaseOrder[];
}

export function PurchaseOrderTable({ orders, filteredOrders }: PurchaseOrderTableProps) {
  const getStatusBadge = (status: PurchaseOrder["status"]) => {
    let variant: "secondary" | "outline" | "default" | "destructive" =
      "default";
    let label = "Confirmed";

    switch (status) {
      case "draft":
        variant = "secondary";
        label = "Draft";
        break;
      case "sent":
        variant = "outline";
        label = "Sent";
        break;
      case "confirmed":
        variant = "default";
        label = "Confirmed";
        break;
      case "received":
        variant = "default";
        label = "Received";
        break;
      case "cancelled":
        variant = "destructive";
        label = "Cancelled";
        break;
    }

    return (
      <Badge variant={variant} className="text-xs">
        {label}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return formatDateToDDMMYYYY(dateString);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Order History
        </CardTitle>
        <CardDescription>
          Showing {filteredOrders.length} of {orders.length} purchase orders
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Expected Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <PackageX className="h-8 w-8 mb-2 opacity-50" />
                      <p className="font-medium">No purchase orders found</p>
                      <p className="text-sm">
                        {orders.length === 0
                          ? "Create your first purchase order to get started"
                          : "Try adjusting your search or filters"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {order.orderNumber}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{order.supplier}</div>
                    </TableCell>
                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                    <TableCell>{formatDate(order.expectedDate)}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell>
                      <div className="text-center">{order.itemCount}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {formatCurrency(order.totalAmount)}
                      </div>
                    </TableCell>
                    <TableCell>{order.createdBy}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="cursor-pointer"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="cursor-pointer"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
