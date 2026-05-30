"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { format } from "date-fns";
import { CreditTransaction } from "./types";

interface ReferralsAuditLogProps {
  transactions: CreditTransaction[];
}

export function ReferralsAuditLog({ transactions }: ReferralsAuditLogProps) {
  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader>
        <CardTitle>Credit Audit Log</CardTitle>
        <CardDescription>
          Detailed transactional history of all earned, spent, and adjusted
          credits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md border-slate-200 dark:border-slate-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12 pl-4">Date</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">User Wallet</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">Type</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">Amount</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((txn) => (
                <TableRow
                  key={txn.id}
                  className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <TableCell className="text-slate-500 dark:text-slate-400 text-xs font-mono pl-4 py-4">
                    {format(new Date(txn.created_at), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell className="text-slate-800 dark:text-slate-200">
                    <span className="font-bold">
                      {txn.user
                        ? `${txn.user.first_name} ${txn.user.last_name}`
                        : "System"}
                    </span>{" "}
                    <br />
                    <span className="text-[10px] font-mono text-slate-400">
                      {txn.user?.email}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        txn.type === "earned"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold text-[10px]"
                          : txn.type === "spent"
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 font-bold text-[10px]"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-bold text-[10px]"
                      }
                    >
                      {txn.type === "earned"
                        ? "Earned"
                        : txn.type === "spent"
                          ? "Redeemed"
                          : "Adjustment"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`font-black text-sm ${
                      txn.type === "earned" 
                        ? "text-emerald-600 dark:text-emerald-400" 
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {txn.type === "earned" ? "+" : "-"}₦
                    {Number(txn.amount).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                    {txn.description}
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-12 text-slate-400 dark:text-slate-500"
                  >
                    No credit transactions recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
