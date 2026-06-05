"use client";

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
import { ReferralRelationship } from "./types";

interface ReferralsRelationshipsTableProps {
  referrals: ReferralRelationship[];
}

export function ReferralsRelationshipsTable({
  referrals,
}: ReferralsRelationshipsTableProps) {
  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader>
        <CardTitle>Referral Relationships</CardTitle>
        <CardDescription>
          All stores registered using user referral links.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md border-slate-200 dark:border-slate-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12 pl-4">
                  Referred Store
                </TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">
                  Referred User
                </TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">
                  Referrer
                </TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">
                  Referral Code
                </TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">
                  Date Registered
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map((ref) => (
                <TableRow
                  key={ref.id}
                  className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <TableCell className="font-bold text-slate-850 dark:text-slate-200 pl-4 py-4">
                    {ref.store ? ref.store.name : "N/A"}
                  </TableCell>
                  <TableCell className="text-slate-700 dark:text-slate-300">
                    <span className="font-bold">{ref.first_name} {ref.last_name}</span> <br />
                    <span className="text-[10px] font-mono text-slate-400">
                      {ref.email}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-700 dark:text-slate-300 font-medium">
                    {ref.referred_by
                      ? `${ref.referred_by.first_name} ${ref.referred_by.last_name}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {ref.referred_by ? ref.referred_by.referral_code : "-"}
                  </TableCell>
                  <TableCell className="text-slate-500 dark:text-slate-400 text-sm">
                    {format(new Date(ref.created_at), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                </TableRow>
              ))}
              {referrals.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-12 text-slate-400 dark:text-slate-500"
                  >
                    No referral registrations tracked yet.
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
