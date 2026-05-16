"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubscriptionWrapper } from "@/components/dashboard/subscription-wrapper";
import { useBillingHistory } from "@/lib/api/hooks";
import { Loader2 } from "lucide-react";

export function BillingView() {
  const { data: historyData, isLoading } = useBillingHistory();
  const transactions = historyData?.transactions || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Subscription & Billing</h1>
        <p className="text-muted-foreground">Manage your plan, payment methods, and billing history</p>
      </div>

      <SubscriptionWrapper />

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
            <div className="text-center py-8 text-muted-foreground">
              No billing history found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-muted text-xs font-bold uppercase">
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((bill: any) => (
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
                      <Button variant="ghost" size="sm" disabled={bill.status !== "Success"}>Download</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
