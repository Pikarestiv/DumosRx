"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateOnlyToDDMMYYYY, formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { formatMoney } from "@/lib/utils/currency";
import type { SubscriptionBucket, SubscriptionWorklistRow } from "@/lib/types/admin";

interface WorklistTableProps {
  rows: SubscriptionWorklistRow[];
  bucket: SubscriptionBucket;
  isLoading: boolean;
  canGrantTrials: boolean;
  canNotify: boolean;
  onGrantTrial?: (row: SubscriptionWorklistRow) => void;
  onActivatePlan?: (row: SubscriptionWorklistRow) => void;
  onNotify?: (row: SubscriptionWorklistRow) => void;
  isError?: boolean;
}

export function WorklistTable({
  rows,
  bucket,
  isLoading,
  isError,
  canGrantTrials,
  canNotify,
  onGrantTrial,
  onActivatePlan,
  onNotify,
}: WorklistTableProps) {
  if (isError) {
    return (
      <p className="text-sm font-medium text-muted-foreground py-8 text-center">
        This list is unavailable right now.
      </p>
    );
  }

  if (isLoading && rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm font-bold text-emerald-500 py-8 text-center">
        Nothing needs attention here.
      </p>
    );
  }

  const isPayments = bucket === "payments";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Owner</TableHead>
          <TableHead>Store</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>{isPayments ? "Last attempt" : "Ends"}</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.user_id}>
            <TableCell>
              <p className="font-bold text-foreground">{row.owner_name}</p>
              <p className="text-xs text-muted-foreground">{row.email}</p>
            </TableCell>
            <TableCell>
              {row.store_id ? (
                <Link
                  href={`/admin/stores/details/?id=${row.store_id}`}
                  className="text-indigo-500 hover:underline font-medium"
                >
                  {row.store_name ?? "View store"}
                </Link>
              ) : (
                <span className="text-muted-foreground">No store</span>
              )}
            </TableCell>
            <TableCell>
              <span className="font-medium text-foreground">{row.plan ?? "—"}</span>
              {row.is_trial && (
                <Badge className="ml-2 bg-amber-500/10 text-amber-500 border-none font-bold text-[10px]">
                  Trial
                </Badge>
              )}
            </TableCell>
            <TableCell>
              {isPayments ? (
                <div>
                  <p className="font-medium text-foreground">
                    {row.last_attempt_at ? formatDateToDDMMYYYY(row.last_attempt_at) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.attempts} attempt{row.attempts === 1 ? "" : "s"}
                    {row.amount !== undefined && ` · ${formatMoney(row.amount, row.currency)}`}
                  </p>
                </div>
              ) : (
                <span className="font-medium text-foreground">
                  {row.end_date ? formatDateOnlyToDDMMYYYY(row.end_date) : "—"}
                </span>
              )}
            </TableCell>
            <TableCell className="text-right space-x-2 whitespace-nowrap">
              {canGrantTrials && bucket !== "payments" && (
                <Button size="sm" variant="outline" onClick={() => onGrantTrial?.(row)}>
                  Grant trial
                </Button>
              )}
              {canGrantTrials && (
                <Button size="sm" variant="outline" onClick={() => onActivatePlan?.(row)}>
                  Activate plan
                </Button>
              )}
              {canNotify && (
                <Button size="sm" variant="outline" onClick={() => onNotify?.(row)}>
                  Notify
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
