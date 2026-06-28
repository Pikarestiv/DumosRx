import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";

interface ProductBatchHistoryProps {
  batches: any[];
  loadingBatches: boolean;
  storeType: string;
}

export function ProductBatchHistory({
  batches,
  loadingBatches,
  storeType,
}: ProductBatchHistoryProps) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Batch History & Tracking
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loadingBatches ? (
          <p className="text-center py-4">Loading batches...</p>
        ) : batches.length === 0 ? (
          <p className="text-center py-4 text-muted-foreground italic">
            No batch records found for this{" "}
            {storeType === "pharmacy" ? "product" : "product"}.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch Number</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch: any) => {
                const days = Math.ceil(
                  (new Date(batch.expiry_date).getTime() -
                    new Date().getTime()) /
                    (1000 * 60 * 60 * 24),
                );
                return (
                  <TableRow key={batch.id}>
                    <TableCell className="font-mono">
                      {batch.batch_number}
                    </TableCell>
                    <TableCell>{batch.quantity} units</TableCell>
                    <TableCell>
                      {formatDateToDDMMYYYY(batch.expiry_date)}
                    </TableCell>
                    <TableCell>
                      {days <= 0 ? (
                        <Badge variant="destructive">Expired</Badge>
                      ) : days <= 90 ? (
                        <Badge
                          variant="outline"
                          className="border-orange-500 text-orange-600"
                        >
                          Near Expiry
                        </Badge>
                      ) : (
                        <Badge variant="default">Healthy</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
