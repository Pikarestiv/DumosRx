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
import { PackageX } from "lucide-react";
import { StockAdjustment } from "@/lib/hooks/use-stock-adjustments";

interface StockAdjustmentTableProps {
  adjustments: StockAdjustment[];
  filteredAdjustments: StockAdjustment[];
  isFuzzyFallback: boolean;
}

export function StockAdjustmentTable({
  adjustments,
  filteredAdjustments,
  isFuzzyFallback,
}: StockAdjustmentTableProps) {
  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAdjustmentBadge = (
    adjustmentType: StockAdjustment["adjustmentType"],
  ) => {
    return (
      <Badge
        variant={adjustmentType === "increase" ? "default" : "destructive"}
        className="text-xs"
      >
        {adjustmentType === "increase" ? "Increase" : "Decrease"}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Adjustment History
        </CardTitle>
        <CardDescription>
          Showing {filteredAdjustments.length} of {adjustments.length}{" "}
          adjustments
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isFuzzyFallback && filteredAdjustments.length > 0 && (
          <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-sm border border-amber-500/20 text-center font-medium rounded-md mb-4">
            Did you mean? (No exact matches found. Showing closest names.)
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAdjustments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <PackageX className="h-8 w-8 mb-2 opacity-50" />
                      <p className="font-medium">No adjustments found</p>
                      <p className="text-sm">
                        {adjustments.length === 0
                          ? "Stock adjustments will appear here after they're created"
                          : "Try adjusting your search"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAdjustments.map((adjustment) => (
                  <TableRow key={adjustment.id}>
                    <TableCell>
                      <div className="text-sm">
                        {formatDateTime(adjustment.date)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{adjustment.product}</div>
                    </TableCell>
                    <TableCell>
                      {getAdjustmentBadge(adjustment.adjustmentType)}
                    </TableCell>
                    <TableCell>
                      <div
                        className={`font-medium ${adjustment.quantity > 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {adjustment.quantity > 0 ? "+" : ""}
                        {adjustment.quantity}
                      </div>
                    </TableCell>
                    <TableCell>{adjustment.reason}</TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate text-sm text-muted-foreground">
                        {adjustment.notes || "—"}
                      </div>
                    </TableCell>
                    <TableCell>{adjustment.user}</TableCell>
                    <TableCell>
                      <Badge
                        variant={adjustment.approved ? "default" : "outline"}
                        className="text-xs"
                      >
                        {adjustment.approved ? "Approved" : "Pending"}
                      </Badge>
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
