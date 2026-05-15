"use client";

import { useState } from "react";
import { Plus, Circle, MoreVertical, Users } from "lucide-react";
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

interface StaffViewProps {
  staff: any[];
  stores: any[];
}

export function StaffView({ staff, stores }: StaffViewProps) {
  const [selectedStore, setSelectedStore] = useState("all");
  
  // Filter staff based on selected store
  const filteredStaff = selectedStore === "all" 
    ? staff 
    : staff.filter(s => s.store_id === selectedStore || s.store_name === selectedStore || s.store === selectedStore);

  const hasStaff = filteredStaff && filteredStaff.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Staff Management</h1>
          <p className="text-muted-foreground">Monitor performance and manage accounts across your fleet</p>
        </div>
        <div className="flex gap-4">
          <select 
            className="bg-background border border-input px-4 py-2 rounded-lg text-sm font-bold focus:ring-2 focus:ring-primary outline-none transition-all"
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            <option value="all">All Stores</option>
            {stores.map(store => (
              <option key={store.id} value={store.id || store.name}>{store.name}</option>
            ))}
          </select>
          <Button variant="outline" className="font-bold">Export Staff List</Button>
          <Button className="font-bold">
            <Plus className="h-4 w-4 mr-2" />
            Invite Staff
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Staff</p>
            <h3 className="text-3xl font-black mt-2">{filteredStaff?.length || 0}</h3>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Now</p>
            <h3 className="text-3xl font-black mt-2 text-green-600">
              {filteredStaff?.filter((s:any) => s.is_active || s.status === 'online').length || 0}
            </h3>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Performance</p>
            <h3 className="text-3xl font-black mt-2 text-primary">
              High
            </h3>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Staff Records</CardTitle>
          <CardDescription>
            {hasStaff 
              ? `Real-time records for ${selectedStore === 'all' ? 'all stores' : selectedStore}.`
              : "No staff records found for this selection."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasStaff ? (
            <div className="py-20 text-center flex flex-col items-center justify-center border-2 border-dashed border-muted rounded-2xl">
              <Users className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <p className="text-muted-foreground font-medium">No results found...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-muted text-xs font-bold uppercase">
                  <TableHead>Staff Member</TableHead>
                  <TableHead className="text-center">Role</TableHead>
                  <TableHead className="text-center">Store / Terminal</TableHead>
                  <TableHead className="text-center">Sales Performance</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Last Sync</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((s: any) => (
                  <TableRow key={s.id} className="border-muted hover:bg-muted/30">
                    <TableCell className="font-bold py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {s.name?.charAt(0) || "U"}
                        </div>
                        <div className="flex flex-col">
                          <span>{s.name}</span>
                          <span className="text-xs text-muted-foreground font-normal">
                            {s.username || s.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-bold capitalize">
                        {s.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      {s.store_name || s.store || "Main Branch"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-black text-foreground">
                          ₦{(s.total_sales || 0).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {s.sales_count || 0} transactions
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={`${(s.is_active || s.status === "online") ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"} font-bold`}
                      >
                        <Circle className={`h-2 w-2 mr-2 fill-current ${(s.is_active || s.status === "online") ? "text-green-500" : "text-slate-300"}`} />
                        {s.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : (s.lastSeen || "Never")}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
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
