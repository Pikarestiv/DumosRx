"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBillingHistory } from "@/lib/hooks/use-billing";

export function BillingHistory() {
  const { data, isLoading } = useBillingHistory();
  const transactions = data?.transactions || [];

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle>Billing History</CardTitle>
        <CardDescription>View and download your recent invoices.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No billing history found.</div>
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
                  <TableCell className="text-sm">{bill.amount}</TableCell>
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
