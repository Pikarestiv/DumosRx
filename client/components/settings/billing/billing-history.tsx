"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useBillingHistory } from "@/lib/hooks/use-billing";
import { formatCurrency } from "@/lib/utils";

function formatBillAmount(amount: string | number) {
  return typeof amount === "number" ? formatCurrency(amount) : amount;
}

export function BillingHistory() {
  const { data, isLoading, isError } = useBillingHistory();
  const transactions = data?.transactions || [];

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle>Billing History</CardTitle>
        <CardDescription>View and download your recent invoices.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : isError ? (
          <div className="text-center py-8 text-sm text-destructive">
            Failed to load billing history — check your connection.
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState icon={Receipt} title="No billing history found" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="text-sm">{bill.date}</TableCell>
                  <TableCell className="font-medium text-sm">{bill.desc}</TableCell>
                  <TableCell className="text-sm">{formatBillAmount(bill.amount)}</TableCell>
                  <TableCell>
                    <Badge className={bill.status === "Success" ? "bg-green-500" : bill.status === "Pending" ? "bg-yellow-500" : "bg-red-500"}>
                      {bill.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={bill.status !== "Success"}
                      onClick={() => {
                        if (bill.receipt_url) window.open(bill.receipt_url, "_blank");
                        else toast("Invoice not available for this transaction.");
                      }}
                    >
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
