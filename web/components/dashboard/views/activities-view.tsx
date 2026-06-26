"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Activity, Search, Filter, Loader2, Store } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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


const ActivityDetails = ({ details }: { details?: string }) => {
  if (!details) return <span>-</span>;
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed === 'object' && parsed !== null) {
      return (
        <div className="flex flex-col gap-1 text-[11px] max-w-[400px]">
          {Object.entries(parsed).slice(0, 3).map(([key, value]) => {
             const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
             return (
               <div key={key} className="flex gap-2 bg-muted/40 px-2 py-1 rounded items-center">
                 <span className="font-bold text-muted-foreground capitalize min-w-[80px]">{key.replace(/_/g, ' ')}</span>
                 <span className="font-mono truncate" title={displayValue}>{displayValue}</span>
               </div>
             )
          })}
          {Object.keys(parsed).length > 3 && (
            <div className="text-xs text-muted-foreground italic px-2">+{Object.keys(parsed).length - 3} more fields</div>
          )}
        </div>
      );
    }
  } catch (e) {
    // not json
  }
  return <div className="truncate max-w-[350px] text-sm" title={details}>{details}</div>;
}

export function ActivitiesView({ stores = [] }: { stores?: StoreProp[] }) {
  const { data: response, isLoading: loading } = useLogs();
  const logs = response?.data ? response.data : Array.isArray(response) ? response : [];
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterStore, setFilterStore] = useState("all");

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
    const matchesSearch = log.details?.toLowerCase().includes(search.toLowerCase()) || 
                          log.table_name?.toLowerCase().includes(search.toLowerCase());
    const matchesAction = filterAction === "all" || log.action?.toLowerCase() === filterAction.toLowerCase();
    const matchesStore = filterStore === "all" || log.user?.store_id?.toString() === filterStore;
    return matchesSearch && matchesAction && matchesStore;
  });

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
              placeholder="Search details or tables..."
              className="pl-10 h-11 bg-muted/50 border-none font-medium rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Select value={filterAction} onValueChange={setFilterAction}>
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
              <Select value={filterStore} onValueChange={setFilterStore}>
                <SelectTrigger className="w-full sm:w-48 h-11 bg-muted/50 border-none font-bold rounded-xl">
                  <SelectValue placeholder="Filter Store" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stores</SelectItem>
                  {stores.map(store => (
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
                    <TableCell colSpan={5} className="h-48 text-center pl-6 pr-6">
                      <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <p className="font-semibold text-sm">Loading activities...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-48 text-center pl-6 pr-6">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Activity className="h-8 w-8 opacity-20" />
                        <p className="font-bold">No activities found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log: ActivityLog) => (
                    <TableRow key={log.id} className="border-muted hover:bg-muted/30 transition-colors">
                      <TableCell className="pl-6 py-4 font-medium whitespace-nowrap">
                        {format(new Date(log.created_at || new Date()), "MMM dd, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-bold">
                        <div className="flex flex-col gap-1.5 mt-1 mb-1">
                          <span>{log.user?.name || log.user?.first_name || log.user_id || "System"}</span>
                          {log.user?.store && (
                            <Badge variant="secondary" className="w-fit text-[10px] font-bold px-1.5 py-0 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200">
                              <Store className="h-3 w-3 mr-1" />
                              {log.user.store.name}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-black uppercase tracking-wider text-[10px] ${getActionColor(log.action)}`}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold text-sm capitalize text-muted-foreground">
                        {log.table_name?.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="pr-6 py-3">
                        <ActivityDetails details={log.details} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
