import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface HighestSellingMedicinesCardProps {
  currencyCode?: string;
  topSellingMeds: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

export function HighestSellingMedicinesCard({
  currencyCode,
  topSellingMeds,
}: HighestSellingMedicinesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif">Highest Selling Medicines</CardTitle>
        <CardDescription>By quantity sold today</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medicine</TableHead>
              <TableHead className="text-right">Qty Sold</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topSellingMeds.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground py-4"
                >
                  No items sold today.
                </TableCell>
              </TableRow>
            ) : (
              topSellingMeds.map((med, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{med.name}</TableCell>
                  <TableCell className="text-right">{med.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(med.revenue, currencyCode)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
