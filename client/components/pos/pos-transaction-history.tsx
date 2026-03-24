"use client";

import { Receipt, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface POSTransactionHistoryProps {
  recentSales: any[];
  onReturnClick: (sale: any) => void;
  currencyCode?: string;
}

export function POSTransactionHistory({
  recentSales,
  onReturnClick,
  currencyCode
}: POSTransactionHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Sales History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trans #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentSales?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                    No recent sales
                  </TableCell>
                </TableRow>
              ) : (
                recentSales?.map((sale: any) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono text-xs">{sale.transaction_number}</TableCell>
                    <TableCell>{sale.customer_name || 'Walk-in'}</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(sale.total_amount, currencyCode)}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-accent hover:text-accent hover:bg-accent/10"
                        onClick={() => onReturnClick(sale)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Return
                      </Button>
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
