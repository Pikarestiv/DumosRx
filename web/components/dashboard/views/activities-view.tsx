"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  Search,
  Filter,
  Loader2,
  Store,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLogs } from "@/lib/api/hooks";

interface StoreProp {
  id: string | number;
  name: string;
}

interface ActivityLog {
  id: string | number;
  created_at?: string | Date;
  action: string;
  table_name?: string;
  details?: string;
  description?: string;
  properties?: {
    table_name?: string;
    details?: string;
  };
  user_id?: string | number;
  user?: {
    name?: string;
    first_name?: string;
    store_id?: string | number;
    store?: {
      name?: string;
    };
  };
}

export const ActivityDetails = ({
  details,
  tableName,
  action,
}: {
  details?: string;
  tableName?: string;
  action?: string;
}) => {
  if (!details) return <span>-</span>;

  let parsedContent: any = null;
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed === "object" && parsed !== null) {
      parsedContent = parsed;
    }
  } catch (_e) {
    // not json
  }

  if (parsedContent) {
    let summary = "";
    const isInsert = action?.toLowerCase() === "insert";

    switch (tableName?.toLowerCase()) {
      case "users":
        summary = isInsert
          ? `Added new staff member: ${parsedContent.first_name || ""} ${parsedContent.last_name || ""}`.trim()
          : `Updated staff member: ${parsedContent.first_name || ""}`;
        break;
      case "customers":
        summary = isInsert
          ? `Added new customer: ${parsedContent.first_name || ""} ${parsedContent.last_name || ""}`.trim()
          : `Updated customer: ${parsedContent.first_name || ""}`;
        break;
      case "medicines":
        if (parsedContent.stock_quantity !== undefined) {
          summary = `Updated medicine stock to ${parsedContent.stock_quantity}`;
        } else if (parsedContent.name) {
          summary = isInsert
            ? `Added new medicine: ${parsedContent.name}`
            : `Updated medicine: ${parsedContent.name}`;
        } else {
          summary = `Updated medicine details`;
        }
        break;
      case "sale_items":
        summary = `Sold ${parsedContent.quantity || 1} units`;
        break;
      case "sales":
        summary = `Recorded sale of ${parsedContent.amount_paid ? "₦" + parsedContent.amount_paid : "items"}`;
        break;
      case "held_transactions":
        summary = `Saved a held transaction for ${parsedContent.customer_name || "Walk-in Customer"}`;
        break;
      case "categories":
        summary = isInsert
          ? `Created new category: ${parsedContent.name}`
          : `Updated category`;
        break;
      default:
        // Generic fallback with nice formatting
        const keys = Object.keys(parsedContent).filter(
          (k) =>
            !k.startsWith("_") &&
            k !== "created_at" &&
            k !== "updated_at" &&
            k !== "id",
        );
        summary = isInsert
          ? `Created new record`
          : `Updated ${keys.length} fields`;
    }

    return (
      <div className="flex flex-col gap-1 text-[13px] max-w-[400px]">
        <div className="font-medium text-foreground">{summary}</div>
      </div>
    );
  }

  return (
    <div className="truncate max-w-[350px] text-[13px]" title={details}>
      {details}
    </div>
  );
};

export const filterIndirectSaleLogs = (logs: any[], log: any) => {
  const tableNameStr = (
    log.table_name ||
    log.properties?.table_name ||
    ""
  ).toLowerCase();

  if (tableNameStr === "sale_items") {
    return false;
  }

  if (tableNameStr === "medicines" && log.action?.toLowerCase() === "update") {
    const logTime = new Date(log.created_at || new Date()).getTime();
    const isPartOfSale = logs.some((otherLog: any) => {
      const otherTable = (
        otherLog.table_name ||
        otherLog.properties?.table_name ||
        ""
      ).toLowerCase();
      if (
        otherTable === "sales" &&
        otherLog.action?.toLowerCase() === "insert"
      ) {
        const otherTime = new Date(otherLog.created_at || new Date()).getTime();
        return (
          log.user_id === otherLog.user_id &&
          Math.abs(logTime - otherTime) < 2000
        );
      }
      return false;
    });

    if (isPartOfSale) {
      try {
        const detailsStr =
          log.details || log.properties?.details || log.description || "";
        const parsed = JSON.parse(detailsStr);
        const keys = Object.keys(parsed).filter(
          (k: string) =>
            !k.startsWith("_") &&
            k !== "created_at" &&
            k !== "updated_at" &&
            k !== "id",
        );
        if (keys.length === 1 && keys[0] === "stock_quantity") {
          return false;
        }
      } catch (_e) {}
    }
  }
  return true;
};

export function ActivitiesView({ stores = [] }: { stores?: StoreProp[] }) {
  const { data: response, isLoading: loading } = useLogs();
  const logs = response?.data
    ? response.data
    : Array.isArray(response)
      ? response
      : [];
  const searchParams = useSearchParams();
  const defaultStoreId = searchParams?.get('storeId') || "all";

  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterStore, setFilterStore] = useState(defaultStoreId);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case "create":
      case "insert":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "update":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "delete":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const filteredLogs = logs.filter((log: ActivityLog) => {
    if (!filterIndirectSaleLogs(logs, log)) return false;

    const tableNameStr = (
      log.table_name ||
      log.properties?.table_name ||
      ""
    ).toLowerCase();
    const detailsStr =
      log.details || log.properties?.details || log.description || "";
    const userNameStr =
      log.user?.name || log.user?.first_name || log.user_id || "System";
    const matchesSearch =
      detailsStr.toLowerCase().includes(search.toLowerCase()) ||
      tableNameStr.includes(search.toLowerCase()) ||
      userNameStr.toString().toLowerCase().includes(search.toLowerCase());
    const matchesAction = filterAction === "all" || log.action?.toLowerCase() === filterAction.toLowerCase();
    const matchesStore = filterStore === "all" || 
                         log.user?.store_id?.toString() === filterStore ||
                         !log.user?.store_id; // Include admin logs in all store filters since they lack a specific store_id
    
    return matchesSearch && matchesAction && matchesStore;
  });

  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h2 className="text-3xl font-black flex items-center gap-2">
            <Activity className="h-8 w-8 text-primary" />
            Staff Activities
          </h2>
          <p className="text-muted-foreground font-medium mt-1">
            Track actions performed across your connected stores.
          </p>
        </div>
      </div>

      <Card className="border-none shadow-md">
        <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b pb-6">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search details, users or tables..."
              className="pl-10 h-11 bg-muted/50 border-none font-medium rounded-xl"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Select
              value={filterAction}
              onValueChange={(val) => {
                setFilterAction(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-40 h-11 bg-muted/50 border-none font-bold rounded-xl">
                <SelectValue placeholder="Filter Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="insert">Create/Insert</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
              </SelectContent>
            </Select>

            {stores && stores.length > 0 && (
              <Select
                value={filterStore}
                onValueChange={(val) => {
                  setFilterStore(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-48 h-11 bg-muted/50 border-none font-bold rounded-xl">
                  <SelectValue placeholder="Filter Store" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stores</SelectItem>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id.toString()}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[800px] w-full">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-muted text-xs font-bold uppercase">
                  <TableHead className="pl-6 py-5">Date & Time</TableHead>
                  <TableHead>User / Staff</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target (Table)</TableHead>
                  <TableHead className="pr-6">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-48 text-center pl-6 pr-6"
                    >
                      <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <p className="font-semibold text-sm">
                          Loading activities...
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-48 text-center pl-6 pr-6"
                    >
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Activity className="h-8 w-8 opacity-20" />
                        <p className="font-bold">No activities found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLogs.map((log: ActivityLog) => (
                    <TableRow
                      key={log.id}
                      className="border-muted hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="pl-6 py-4 font-medium whitespace-nowrap">
                        {format(
                          new Date(log.created_at || new Date()),
                          "MMM dd, yyyy HH:mm",
                        )}
                      </TableCell>
                      <TableCell className="font-bold">
                        <div className="flex flex-col gap-1.5 mt-1 mb-1">
                          <span>
                            {log.user?.name ||
                              log.user?.first_name ||
                              log.user_id ||
                              "System"}
                          </span>
                          {log.user?.store && (
                            <Badge
                              variant="secondary"
                              className="w-fit text-[10px] font-bold px-1.5 py-0 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                            >
                              <Store className="h-3 w-3 mr-1" />
                              {log.user.store.name}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-black uppercase tracking-wider text-[10px] ${getActionColor(log.action)}`}
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold text-sm capitalize text-muted-foreground">
                        {(
                          log.table_name ||
                          log.properties?.table_name ||
                          "System"
                        ).replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="pr-6 max-w-[200px] truncate">
                        <ActivityDetails
                          details={
                            log.details ||
                            log.properties?.details ||
                            log.description
                          }
                          tableName={
                            log.table_name || log.properties?.table_name
                          }
                          action={log.action}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-muted">
              <div className="text-sm text-muted-foreground font-medium">
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, filteredLogs.length)} of{" "}
                {filteredLogs.length} entries
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className="h-8 px-2 border-muted"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-bold min-w-12 text-center">
                  {currentPage} / {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="h-8 px-2 border-muted"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
