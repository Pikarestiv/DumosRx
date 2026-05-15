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

export function BillingView() {
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
              {[
                { date: "May 1, 2026", desc: "Enterprise Plan (Monthly)", amount: "₦45,000", status: "Paid" },
                { date: "Apr 1, 2026", desc: "Enterprise Plan (Monthly)", amount: "₦45,000", status: "Paid" },
              ].map((bill, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{bill.date}</TableCell>
                  <TableCell className="font-medium text-sm">{bill.desc}</TableCell>
                  <TableCell className="text-sm">{bill.amount}</TableCell>
                  <TableCell>
                    <Badge className="bg-green-500">{bill.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">Download</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
