"use client";

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
import { Star } from "lucide-react";

export const recentTransactions = [
  {
    id: "TXN001",
    customerId: "CUST001",
    customerName: "Adebayo Johnson",
    amount: 25400,
    pointsEarned: 254,
    date: "2024-01-10",
    items: ["Paracetamol 500mg", "Vitamin C 1000mg"],
  },
  {
    id: "TXN002",
    customerId: "CUST002",
    customerName: "Fatima Abdullahi",
    amount: 45600,
    pointsEarned: 456,
    date: "2024-01-12",
    items: ["Insulin Glargine", "Blood glucose strips"],
  },
];

export function CustomerTransactions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Customer Transactions</CardTitle>
        <CardDescription>
          Latest purchases and points activity
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Points Earned</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Items</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentTransactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell className="font-medium">
                  {transaction.id}
                </TableCell>
                <TableCell>{transaction.customerName}</TableCell>
                <TableCell>
                  ₦{transaction.amount.toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500" />
                    {transaction.pointsEarned}
                  </div>
                </TableCell>
                <TableCell>{transaction.date}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    {transaction.items.join(", ")}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
