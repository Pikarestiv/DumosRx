"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { getActivityLog } from "@/lib/db/queries/activity-log";
import { describeActivity } from "@/components/activity-log/describe-activity";
import { queryKeys } from "@/lib/query-keys";

export function StaffActivitiesTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filters = { tableName: "users", page, pageSize };
  const { data, isLoading } = useQuery({
    ...queryKeys.activityLog.list(JSON.stringify(filters)),
    queryFn: () => getActivityLog(filters),
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={3} className="h-24 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell>
            </TableRow>
          )}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                No staff activity recorded yet.
              </TableCell>
            </TableRow>
          )}
          {!isLoading && rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-muted-foreground text-sm">
                {row.created_at ? format(new Date(row.created_at), "MMM d, yyyy h:mm a") : "N/A"}
              </TableCell>
              <TableCell>{row.user_name || "System"}</TableCell>
              <TableCell>{describeActivity(row)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination
        page={page}
        totalPages={totalPages}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
